/**
 * Hippocampe as a service of the user's session, on Linux with systemd: one user unit, the server,
 * which holds its database itself (PGlite, in a folder of the data), started with the session,
 * restarted on failure, listening on `127.0.0.1` only. Everything that touches the system goes
 * through `System`, so a test runs it without one.
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Console, Context, Effect, Layer, Schedule, Schema } from 'effect'
import { POSTGRES_MAJOR } from '../core/database/index.ts'
import { type Home, readEnvironment } from './home.ts'

/** What a command run on the system answered. */
export type Ran = { readonly code: number; readonly output: string }

/** The system Hippocampe is installed on: its commands, and whether an address answers. */
export class System extends Context.Service<
  System,
  {
    readonly run: (
      command: string,
      args: ReadonlyArray<string>,
      environment?: Readonly<Record<string, string>>,
      input?: string,
    ) => Effect.Effect<Ran>
    readonly answers: (url: string) => Effect.Effect<boolean>
  }
>()('@hippocampe/local/System') {}

/** The real system: its processes and its network. */
export const realSystem = Layer.succeed(System, {
  run: (command, args, environment, input) =>
    Effect.sync(() => {
      const ran = spawnSync(command, [...args], {
        encoding: 'utf8',
        env: { ...process.env, ...environment },
        input,
      })
      return { code: ran.status ?? 1, output: `${ran.stdout ?? ''}${ran.stderr ?? ''}` }
    }),
  answers: (url) =>
    Effect.promise(() =>
      fetch(url).then(
        (response) => response.ok,
        () => false,
      ),
    ),
})

/** A refusal of the service, in one sentence. */
export class ServiceRefused extends Schema.TaggedError<ServiceRefused>()('ServiceRefused', {
  message: Schema.String,
}) {}

const SERVER_UNIT = 'hippocampe.service'

/** How the service runs Hippocampe: this executable, or Bun and this script in a clone. */
export const commandOfHippocampe = () => {
  const given = process.env['HIPPOCAMPE_EXECUTABLE']
  if (given !== undefined) return [given]
  const script = process.argv[1] ?? ''
  return script.endsWith('.ts') ? [process.execPath, script] : [process.execPath]
}

/** A path as a unit takes it: quoted, for a home folder with a space in it. */
const quoted = (path: string) => `"${path}"`

/** The user unit: the server, and its database inside it. */
export const unitOf = (home: Home, hippocampe: ReadonlyArray<string>) =>
  [
    '[Unit]',
    'Description=Hippocampe',
    '',
    '[Service]',
    `EnvironmentFile=${home.environment}`,
    `ExecStart=${[...hippocampe.map(quoted), 'serve'].join(' ')}`,
    'Restart=on-failure',
    'RestartSec=2',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')

export type InstallOptions = {
  readonly email: string
  readonly instance: string
  readonly port: number
}

/** Runs a command, refused with its output when it fails. */
const must = (
  command: string,
  args: ReadonlyArray<string>,
  environment?: Record<string, string>,
  input?: string,
) =>
  Effect.gen(function* () {
    const ran = yield* (yield* System).run(command, args, environment, input)
    if (ran.code === 0) return ran.output
    return yield* new ServiceRefused({
      message: `${command} ${args.join(' ')} failed: ${ran.output.trim()}`,
    })
  })

const systemctl = (...args: ReadonlyArray<string>) => must('systemctl', ['--user', ...args])

/**
 * Refuses, before anything changes, a home where an earlier version (0.6.0 to 0.12.x, or Grenier
 * before them) left the database its own PostgreSQL ran: this version would start empty beside it.
 */
const refuseEarlierDatabase = (home: Home) => {
  const earlier = home.earlierDatabases.find((folder) => existsSync(folder))
  if (earlier === undefined) return Effect.void
  return Effect.fail(
    new ServiceRefused({
      message: `${earlier} holds the database of Hippocampe 0.12 or earlier, run by its own PostgreSQL; this version keeps its data in PGlite, inside the server, and changes nothing here. To keep that data, run Hippocampe 0.12 on it (npm install --global @netsirk/hippocampe@0.12, then hippo export:markdown <folder>, or hippo backup), then hippo service uninstall with it, move ${dirname(earlier)} aside, and install this version again.`,
    }),
  )
}

/** Waits until `ready` is true, a minute at most. */
const waitFor = (what: string, ready: Effect.Effect<boolean>) =>
  ready.pipe(
    Effect.flatMap((ok) =>
      ok ? Effect.void : Effect.fail(new ServiceRefused({ message: `${what} did not start.` })),
    ),
    Effect.retry({ schedule: Schedule.spaced('500 millis'), times: 120 }),
  )

/**
 * Installs Hippocampe for this user: its folders, its unit enabled and started (the server makes its
 * database at its first start), then its owner and a first key, whose file it names with the address
 * of MCP. Installed again, it keeps the data, the secret and the key, and takes the new unit.
 */
export const install = Effect.fn('install')(function* (home: Home, options: InstallOptions) {
  const system = yield* System
  yield* refuseEarlierDatabase(home)
  mkdirSync(home.units, { recursive: true })
  // Readable by this user only: the database, the key, the backups.
  for (const folder of [home.data, home.config, home.kept, home.media, home.export, home.backups]) {
    mkdirSync(folder, { recursive: true })
    chmodSync(folder, 0o700)
  }
  const fresh = !existsSync(home.environment)
  if (fresh) {
    writeFileSync(
      home.environment,
      [
        `HIPPOCAMPE_INSTANCE=${options.instance}`,
        `HIPPOCAMPE_HOST=127.0.0.1`,
        `PORT=${options.port}`,
        `HIPPOCAMPE_DATABASE_DIR=${home.database}`,
        `BETTER_AUTH_SECRET=${randomBytes(32).toString('base64url')}`,
        `MEDIA_DIR=${home.media}`,
        `EXPORT_DIR=${home.export}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    )
  }
  const environment = readEnvironment(home.environment)
  const port = Number(environment['PORT'] ?? options.port)
  const instance = environment['HIPPOCAMPE_INSTANCE'] ?? options.instance
  // Installed already, the file decides: an install never moves a database under its server.
  const kept =
    !fresh && (port !== options.port || instance !== options.instance)
      ? [
          `Installed already: the values of ${home.environment} are kept (port ${port}, instance ${instance}); edit that file to change them.`,
        ]
      : []
  const hippocampe = commandOfHippocampe()
  writeFileSync(join(home.units, SERVER_UNIT), unitOf(home, hippocampe))
  yield* systemctl('daemon-reload')
  yield* systemctl('enable', SERVER_UNIT)
  yield* systemctl('restart', SERVER_UNIT)
  const address = `http://127.0.0.1:${port}`
  yield* waitFor('The server of Hippocampe', system.answers(`${address}/health`))
  const said = [...kept, `Hippocampe runs at ${address}, for this machine only.`]
  if (!existsSync(home.key)) {
    // A command of its own, which reaches the database through the server that holds it.
    const [command = '', ...script] = hippocampe
    const created = yield* must(
      command,
      [
        ...script,
        'key:create',
        '--name',
        'local',
        '--rights',
        'read,write,sensitive',
        '--owner',
        options.email,
      ],
      environment,
    )
    const secret = created.trim().split('\n').at(-1)?.trim() ?? ''
    writeFileSync(home.key, `${secret}\n`, { mode: 0o600 })
    chmodSync(home.key, 0o600)
    said.push(`The owner is ${options.email}; the key of this machine is in ${home.key}.`)
  } else said.push(`The key of this machine is in ${home.key}, as it was.`)
  said.push(
    `MCP is at ${address}/mcp. For Claude Code:`,
    `  claude mcp add --transport http hippocampe ${address}/mcp --header "Authorization: Bearer $(cat ${home.key})"`,
  )
  return said.join('\n')
})

/** Stops and removes the unit; the data and the configuration stay unless `purge`. */
export const uninstall = Effect.fn('uninstall')(function* (home: Home, purge: boolean) {
  const system = yield* System
  // Already stopped or never enabled is no reason to stop here.
  yield* system.run('systemctl', ['--user', 'disable', '--now', SERVER_UNIT])
  rmSync(join(home.units, SERVER_UNIT), { force: true })
  yield* system.run('systemctl', ['--user', 'daemon-reload'])
  if (purge) {
    const kept = `${home.kept} (the backups and the export)`
    yield* Console.log(`Deleting ${home.data} and ${home.config}; keeping ${kept}.`)
    rmSync(home.data, { recursive: true, force: true })
    rmSync(home.config, { recursive: true, force: true })
    return `Hippocampe is uninstalled. Deleted: ${home.data} and ${home.config}. Kept: ${kept}.`
  }
  return `Hippocampe is uninstalled. Its data stays in ${home.data}, its configuration in ${home.config}: give --purge to delete them.`
})

/** Starts the service, its database with it. */
export const start = Effect.as(systemctl('start', SERVER_UNIT), 'Hippocampe is started.')

/** Stops the service, its database with it. */
export const stop = Effect.as(systemctl('stop', SERVER_UNIT), 'Hippocampe is stopped.')

/** What systemd says of the service. */
export const status = Effect.gen(function* () {
  const { output } = yield* (yield* System).run('systemctl', [
    '--user',
    'status',
    '--no-pager',
    SERVER_UNIT,
  ])
  return output.trimEnd()
})

/** The last lines the server wrote. */
export const logs = Effect.map(
  must('journalctl', ['--user', '-u', SERVER_UNIT, '-n', '200', '--no-pager']),
  (output) => output.trimEnd(),
)

/** What a backup says of itself, first in its archive. */
const MANIFEST = 'hippocampe-backup.json'
const Manifest = Schema.fromJsonString(
  Schema.Struct({
    hippocampe: Schema.String,
    engine: Schema.Literal('pglite'),
    postgres: Schema.Int,
    made: Schema.String,
  }),
)

/** The version of this Hippocampe, `unknown` in a clone. */
const versionOfHippocampe = () => process.env['HIPPOCAMPE_VERSION'] ?? 'unknown'

/** The major version of the PostgreSQL that wrote the database, as its folder says. */
const postgresMajor = (home: Home) => {
  const written = join(home.database, 'pgdata', 'PG_VERSION')
  return existsSync(written) ? Number(readFileSync(written, 'utf8').trim()) : POSTGRES_MAJOR
}

/** A moment as a file name takes it. */
const stampOf = (date: Date) => date.toISOString().replaceAll(':', '-')

/**
 * Writes the database and the media into `file`, after the manifest, with the service stopped: the
 * file is there, readable by this user only, before `tar` writes a byte into it, even when it
 * names a file that was readable.
 */
const archive = Effect.fn('archive')(function* (home: Home, file: string) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, '', { mode: 0o600 })
  chmodSync(file, 0o600)
  const manifest = Schema.encodeSync(Manifest)({
    hippocampe: versionOfHippocampe(),
    engine: 'pglite',
    postgres: postgresMajor(home),
    made: new Date().toISOString(),
  })
  const folder = mkdtempSync(join(tmpdir(), 'hippocampe-backup-'))
  writeFileSync(join(folder, MANIFEST), manifest, { mode: 0o600 })
  yield* must('tar', [
    '-czf',
    file,
    '-C',
    folder,
    MANIFEST,
    '-C',
    home.data,
    'pglite',
    'media',
  ]).pipe(Effect.ensuring(Effect.sync(() => rmSync(folder, { recursive: true, force: true }))))
})

/**
 * A copy of the database and the media, into the backups folder unless `to` names a file: the
 * service stops for the few seconds of the copy, so the copy is whole, then starts again. The copy
 * is of the database's own folder, which `restore` puts back in place with the service stopped.
 */
export const backup = Effect.fn('backup')(function* (home: Home, to: string | undefined) {
  const file = to ?? join(home.backups, `hippocampe-${stampOf(new Date())}.tar.gz`)
  yield* systemctl('stop', SERVER_UNIT)
  yield* archive(home, file).pipe(Effect.ensuring(Effect.ignore(systemctl('start', SERVER_UNIT))))
  return `The database and the media are saved in ${file}.`
})

/** Whether version `a` is newer than `b`; never when either is unknown. */
const newer = (a: string, b: string) => {
  const parts = (version: string) => /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(version)
  const [x, y] = [parts(a), parts(b)]
  if (x === null || y === null) return false
  for (const at of [1, 2, 3])
    if (Number(x[at]) !== Number(y[at])) return Number(x[at]) > Number(y[at])
  // A release is newer than its own pre-releases.
  return x[4] === undefined && y[4] !== undefined
}

/**
 * What a backup is, read from its archive before anything is touched: its manifest, refused when it
 * is not a backup this Hippocampe can put back.
 */
const checkedBackup = Effect.fn('checkedBackup')(function* (file: string) {
  const notBackup = (why: string) =>
    new ServiceRefused({
      message: `${file} is not a backup of Hippocampe: ${why}. Give a file written by hippo backup.`,
    })
  if (!existsSync(file)) return yield* notBackup('there is no such file')
  const system = yield* System
  // Read whole: an archive cut short fails here, not halfway through the restore.
  const listed = yield* system.run('tar', ['-tzf', file])
  if (listed.code !== 0) return yield* notBackup('it is not an archive that tar can read')
  const names = listed.output.split('\n')
  const holds = (folder: string) => names.some((name) => name.startsWith(`${folder}/`))
  if (holds('postgres'))
    return yield* new ServiceRefused({
      message: `${file} is a backup of Hippocampe 0.12 or earlier, whose database its own PostgreSQL ran; this version keeps its data in PGlite and cannot put it back. Restore it with Hippocampe 0.12 (npm install --global @netsirk/hippocampe@0.12).`,
    })
  if (!holds('pglite') || !holds('media'))
    return yield* notBackup('it holds no pglite/ and media/ folders')
  if (!names.includes(MANIFEST)) return yield* notBackup(`it has no ${MANIFEST}`)
  const read = yield* system.run('tar', ['-xzOf', file, MANIFEST])
  const manifest = yield* Schema.decodeUnknownEffect(Manifest)(read.output).pipe(
    Effect.mapError(() => notBackup(`its ${MANIFEST} is not one hippo backup writes`)),
  )
  const installed = versionOfHippocampe()
  if (newer(manifest.hippocampe, installed))
    return yield* new ServiceRefused({
      message: `${file} was written by Hippocampe ${manifest.hippocampe}, newer than this one (${installed}): update Hippocampe first, then restore it.`,
    })
  if (manifest.postgres !== POSTGRES_MAJOR)
    return yield* new ServiceRefused({
      message: `${file} holds a database of PostgreSQL ${manifest.postgres}, and this Hippocampe embeds PostgreSQL ${POSTGRES_MAJOR}: a database folder does not move across major versions. Restore it with a Hippocampe that embeds PostgreSQL ${manifest.postgres}.`,
    })
  return manifest
})

/**
 * Puts a backup back: checked before anything is touched, then, with the service stopped, what
 * is there is saved as a backup of its own and moved aside, the backup unpacked, and the service
 * started on it (which migrates the database). Nothing is deleted before the new data runs: a
 * failure after the move puts back what was moved aside, and starts the service on it.
 */
export const restore = Effect.fn('restore')(function* (home: Home, file: string) {
  if (!existsSync(home.environment) || !existsSync(join(home.units, SERVER_UNIT)))
    return yield* new ServiceRefused({
      message:
        'Hippocampe is not installed for this user: run hippo service install first, then restore.',
    })
  const manifest = yield* checkedBackup(file)
  const system = yield* System
  const stamp = stampOf(new Date())
  const before = join(home.backups, `hippocampe-before-restore-${stamp}.tar.gz`)
  yield* systemctl('stop', SERVER_UNIT)
  yield* archive(home, before).pipe(
    Effect.onError(() =>
      Effect.sync(() => rmSync(before, { force: true })).pipe(
        Effect.andThen(Effect.ignore(systemctl('start', SERVER_UNIT))),
      ),
    ),
    Effect.mapError(
      (error) =>
        new ServiceRefused({
          message: `Nothing is restored: what is there could not be saved first in ${before}, and stays as it was. What failed: ${error.message}`,
        }),
    ),
  )
  const moved = [home.database, home.media].map((live) => ({
    live,
    aside: `${live}.before-restore-${stamp}`,
  }))
  const putBack = Effect.gen(function* () {
    yield* system.run('systemctl', ['--user', 'stop', SERVER_UNIT])
    for (const { live, aside } of moved)
      if (existsSync(aside)) {
        rmSync(live, { recursive: true, force: true })
        renameSync(aside, live)
      }
    yield* system.run('systemctl', ['--user', 'start', SERVER_UNIT])
  })
  const address = `http://127.0.0.1:${readEnvironment(home.environment)['PORT']}`
  yield* Effect.gen(function* () {
    for (const { live, aside } of moved) renameSync(live, aside)
    yield* must('tar', ['-xzf', file, '-C', home.data, 'pglite', 'media'])
    for (const { live } of moved) chmodSync(live, 0o700)
    yield* systemctl('start', SERVER_UNIT)
    yield* waitFor('The server of Hippocampe', system.answers(`${address}/health`))
  }).pipe(
    Effect.onError(() => putBack),
    Effect.mapError(
      (error) =>
        new ServiceRefused({
          message: `Restoring ${file} failed, and nothing is lost: the data that was there is put back and Hippocampe started on it (it is also saved in ${before}). What failed: ${error.message}`,
        }),
    ),
  )
  for (const { aside } of moved) rmSync(aside, { recursive: true, force: true })
  return [
    `Restored ${file}, a backup of Hippocampe ${manifest.hippocampe} made on ${manifest.made}: its database and its media are in ${home.data}.`,
    `What was there before is saved in ${before}: restore that file to go back.`,
    `Hippocampe runs at ${address}.`,
  ].join('\n')
})
