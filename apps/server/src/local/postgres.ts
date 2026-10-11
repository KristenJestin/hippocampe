/**
 * The PostgreSQL Hippocampe runs itself, in local mode (`HIPPOCAMPE_DATABASE_DIR`): the binaries
 * the package carries, started as a child of the process that needs the database, on a Unix
 * socket in the database folder and on no TCP port. The server owns its PostgreSQL for as long as
 * it runs, and stops it when it stops; a command reaches the PostgreSQL of the running server, or
 * starts its own for the length of the command. PostgreSQL's own `postmaster.pid` keeps a second
 * one off the folder. In external mode (`DATABASE_URL`), nothing here runs.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Deferred, Effect, Schedule, Schema } from 'effect'
import { localDatabaseFolder } from '../core/database/index.ts'

/** Why the PostgreSQL of the local mode could not run, or stopped, in one sentence. */
export class PostgresRefused extends Schema.TaggedError<PostgresRefused>()('PostgresRefused', {
  message: Schema.String,
}) {}

/**
 * Where the PostgreSQL binaries the package carries are: `HIPPOCAMPE_POSTGRES_BINARIES` (the
 * launcher of the npm package, and the unit, set it), or the package installed beside Hippocampe.
 */
export const postgresSource = () =>
  process.env['HIPPOCAMPE_POSTGRES_BINARIES'] ??
  join(
    dirname(createRequire(import.meta.url).resolve('@embedded-postgres/linux-x64/package.json')),
    'native',
  )

const Links = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ source: Schema.String, target: Schema.String })),
)

/**
 * The binaries, run where the package put them, with the links to their libraries the package
 * leaves out made in a folder of this user's own, removed when the scope closes: the environment
 * a binary is run with points its loader there. The rules of who may connect are kept there too.
 */
export const postgresBinaries = Effect.acquireRelease(
  Effect.sync(() => {
    const source = postgresSource()
    const links = mkdtempSync(join(tmpdir(), 'hippocampe-postgres-'))
    const listed = join(source, 'pg-symlinks.json')
    if (existsSync(listed))
      for (const { source: library, target } of Schema.decodeUnknownSync(Links)(
        readFileSync(listed, 'utf8'),
      ))
        // Written relative to the package (`native/lib/…`): the source is that `native` folder.
        symlinkSync(join(source, library.replace(/^native\//, '')), join(links, basename(target)))
    // Who may connect, whatever the folder says: anyone who can open its socket, which is this
    // user alone; never over TCP. A folder made by an earlier version, with a password, opens too.
    writeFileSync(join(links, 'pg_hba.conf'), 'local all all trust\n', { mode: 0o600 })
    return {
      links,
      binary: (name: string) => join(source, 'bin', name),
      // A library loaded through a link finds its own (`$ORIGIN`) beside the link: both folders.
      environment: { LD_LIBRARY_PATH: `${links}:${join(source, 'lib')}` },
    }
  }),
  ({ links }) => Effect.sync(() => rmSync(links, { recursive: true, force: true })),
)

/** What `postmaster.pid` says of the PostgreSQL that holds the folder, if one does. */
const postmasterOf = (folder: string) => {
  const file = join(folder, 'postmaster.pid')
  if (!existsSync(file)) return undefined
  const lines = readFileSync(file, 'utf8').split('\n')
  return { pid: Number(lines[0]), ready: lines[7]?.trim() === 'ready' }
}

/** Whether a process runs: the local mode is for Linux, which lists them under `/proc`. */
const alive = (pid: number) => pid > 0 && existsSync(`/proc/${pid}`)

/**
 * Makes the database in an empty or missing folder: readable by this user only, reached through
 * its socket alone, without a password (the folder is the guard), never over TCP.
 */
const made = (folder: string, binaries: Effect.Success<typeof postgresBinaries>) =>
  Effect.gen(function* () {
    if (existsSync(folder) && readdirSync(folder).length > 0) return
    const ran = spawnSync(
      binaries.binary('initdb'),
      [
        '-D',
        folder,
        '-U',
        'hippocampe',
        '--auth-local=trust',
        '--auth-host=reject',
        '-E',
        'UTF8',
        '--locale=C',
      ],
      { encoding: 'utf8', env: { ...process.env, ...binaries.environment } },
    )
    if (ran.status !== 0)
      return yield* new PostgresRefused({
        message: `PostgreSQL could not make the database in ${folder}: ${`${ran.stdout ?? ''}${ran.stderr ?? ''}${ran.error?.message ?? ''}`.trim()}`,
      })
  })

/** The last lines a process wrote, a few thousand characters at most. */
const LAST = 4000

/**
 * PostgreSQL on `folder`, a child of this process until the scope closes, which stops it with a
 * fast shutdown and waits for it to end. Its output goes to standard error once it is ready
 * (`forward`), and into the refusal when it does not start. Returns what fails when it ends on its
 * own.
 */
export const postgresOn = (folder: string, forward: boolean) =>
  Effect.gen(function* () {
    const binaries = yield* postgresBinaries
    yield* made(folder, binaries)
    const ended = yield* Deferred.make<never, PostgresRefused>()
    let output = ''
    let ready = false
    let stopping = false
    const endedWith = (sentence: string) =>
      Deferred.doneUnsafe(ended, Effect.fail(new PostgresRefused({ message: sentence })))
    const child = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const postgres = spawn(
          binaries.binary('postgres'),
          [
            '-D',
            folder,
            '-k',
            folder,
            '-p',
            '5432',
            '-c',
            'listen_addresses=',
            '-c',
            `hba_file=${join(binaries.links, 'pg_hba.conf')}`,
          ],
          {
            env: { ...process.env, ...binaries.environment },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        const heard = (chunk: Buffer) => {
          if (ready && forward) process.stderr.write(chunk)
          else output = `${output}${chunk.toString('utf8')}`.slice(-LAST)
        }
        postgres.stdout.on('data', heard)
        postgres.stderr.on('data', heard)
        postgres.once('error', (error) =>
          endedWith(`PostgreSQL could not be started: ${error.message}.`),
        )
        postgres.once('exit', (code, signal) => {
          if (stopping) return
          if (output.includes('lock file "postmaster.pid" already exists'))
            return endedWith(
              `The database folder ${folder} is in use by another PostgreSQL (process ${postmasterOf(folder)?.pid}): stop it first (hippo service stop), or give another folder.`,
            )
          const how = signal === null ? `code ${code}` : `signal ${signal}`
          endedWith(
            ready
              ? `PostgreSQL ended on its own (${how}): Hippocampe stops with it.`
              : `PostgreSQL ended on its own (${how}) before it was ready: ${output.trim()}`,
          )
        })
        return postgres
      }),
      (postgres: ChildProcess) =>
        Effect.callback<void>((resume) => {
          stopping = true
          if (postgres.exitCode !== null || postgres.signalCode !== null) return resume(Effect.void)
          postgres.once('exit', () => resume(Effect.void))
          // A fast shutdown: sessions are ended, what was written is kept, nothing is recovered next time.
          postgres.kill('SIGINT')
        }),
    )
    const accepting = Effect.suspend(() => {
      const held = postmasterOf(folder)
      return held !== undefined && held.pid === child.pid && held.ready
        ? Effect.void
        : Effect.fail(
            new PostgresRefused({
              message: `PostgreSQL did not start within a minute: ${output.trim()}`,
            }),
          )
    }).pipe(Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 600 }))
    yield* Effect.raceFirst(accepting, Deferred.await(ended))
    ready = true
    if (forward) process.stderr.write(output)
    return Deferred.await(ended)
  })

/**
 * The PostgreSQL of the server, in local mode: started before it serves, stopped when it stops.
 * Returns what fails when PostgreSQL ends on its own, so the server ends with it; in external
 * mode, nothing runs and that never happens.
 */
export const serverPostgres = Effect.gen(function* () {
  const folder = yield* localDatabaseFolder
  if (folder === undefined) return Effect.never
  return yield* postgresOn(folder, true)
})

/**
 * The PostgreSQL of a command, in local mode: the one of the running server when there is one,
 * reached through its socket, or one of its own for the length of the command.
 */
export const commandPostgres = Effect.gen(function* () {
  const folder = yield* localDatabaseFolder
  if (folder === undefined) return
  const held = postmasterOf(folder)
  if (held !== undefined && held.ready && alive(held.pid)) return
  yield* postgresOn(folder, false)
})
