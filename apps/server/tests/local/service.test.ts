import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { homeOf } from '../../src/local/home.ts'
import * as service from '../../src/local/service.ts'

const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-service-'))
const home = homeOf({ HOME: join(scratch, 'home') })

/** Each command the service ran, as it ran it. */
const ran: Array<string> = []

/** The mode of the archive when `tar` started to write it, `null` while there was no file. */
let archiveWhenTarRan: number | null = null

/** A system that does what it is told and says so, without systemd. */
const fakeSystem = Layer.succeed(service.System, {
  run: (command, args) =>
    Effect.sync(() => {
      ran.push([command, ...args].join(' '))
      if (command === 'tar') {
        const archive = args[1] ?? ''
        archiveWhenTarRan = existsSync(archive) ? statSync(archive).mode & 0o777 : null
        writeFileSync(archive, 'an archive')
      }
      const created = args.includes('key:create')
      return {
        code: 0,
        output: created ? 'The key local is created.\nIts secret:\n\nsecret-of-the-tests\n' : '',
      }
    }),
  answers: () => Effect.succeed(true),
})

const run = <A, E>(effect: Effect.Effect<A, E, service.System>) =>
  Effect.runPromise(effect.pipe(Effect.provide(fakeSystem)))

const options = { email: 'owner@example.org', instance: 'production', port: 7468 }

beforeAll(() => {
  process.env['HIPPOCAMPE_EXECUTABLE'] = '/opt/hippocampe/bin/hippo'
})

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('hippo service install', () => {
  test('service install writes one unit and no PostgreSQL', async () => {
    const said = await run(service.install(home, options))
    const environment = readFileSync(home.environment, 'utf8')
    expect(environment).toMatch(/^HIPPOCAMPE_INSTANCE=production$/m)
    expect(environment).toMatch(/^HIPPOCAMPE_HOST=127\.0\.0\.1$/m)
    // The database is a folder the server opens itself: no address, no password, no server.
    expect(environment).toContain(`HIPPOCAMPE_DATABASE_DIR=${home.database}`)
    expect(home.database).toBe(join(scratch, 'home', '.local', 'share', 'hippocampe', 'pglite'))
    expect(environment).not.toContain('DATABASE_URL')
    expect(environment).toMatch(/^BETTER_AUTH_SECRET=[\w-]{40,}$/m)
    // The export and the backups are kept apart from what `--purge` deletes.
    expect(home.export).toBe(join(scratch, 'home', 'Hippocampe', 'export'))
    expect(home.backups).toBe(join(scratch, 'home', 'Hippocampe', 'backups'))
    expect(environment).toContain(`EXPORT_DIR=${home.export}`)
    expect(statSync(home.environment).mode & 0o777).toBe(0o600)
    for (const folder of [home.data, home.config, home.kept, home.export, home.backups, home.media])
      expect({ folder, mode: statSync(folder).mode & 0o777 }).toEqual({ folder, mode: 0o700 })
    const server = readFileSync(join(home.units, 'hippocampe.service'), 'utf8')
    expect(server).toContain('ExecStart="/opt/hippocampe/bin/hippo" serve')
    expect(server).toContain(`EnvironmentFile=${home.environment}`)
    expect(server).toContain('Restart=on-failure')
    expect(server).toContain('WantedBy=default.target')
    expect(server).not.toMatch(/Requires|After|postgres/)
    expect(readdirSync(home.units)).toEqual(['hippocampe.service'])
    expect(readdirSync(home.data).toSorted()).toEqual(['media'])
    expect(ran).toEqual([
      'systemctl --user daemon-reload',
      'systemctl --user enable hippocampe.service',
      'systemctl --user restart hippocampe.service',
      '/opt/hippocampe/bin/hippo key:create --name local --rights read,write,sensitive --owner owner@example.org',
    ])
    expect(readFileSync(home.key, 'utf8')).toBe('secret-of-the-tests\n')
    expect(statSync(home.key).mode & 0o777).toBe(0o600)
    expect(said).toContain('MCP is at http://127.0.0.1:7468/mcp')
    expect(said).not.toContain('secret-of-the-tests')
    // A machine with nothing under the old names has nothing to move.
    expect(said).not.toMatch(/Moved|Renamed|Stopped/)
  })

  test('installed again, it keeps the database, the secret, the key, and says it keeps its ports', async () => {
    const before = readFileSync(home.environment, 'utf8')
    ran.length = 0
    const said = await run(service.install(home, { ...options, port: 5000, instance: 'local' }))
    expect(readFileSync(home.environment, 'utf8')).toBe(before)
    expect(said).toContain(
      `Installed already: the values of ${home.environment} are kept (port 7468, instance production); edit that file to change them.`,
    )
    expect(ran.some((line) => line.includes('key:create'))).toBe(false)
  })
})

describe('an installation made with the embedded PostgreSQL of 0.6.0 to 0.12.x', () => {
  /** A home where that version, or Grenier before it, left its database. */
  const left = (name: string, data: string) => {
    const earlier = homeOf({ HOME: join(scratch, name) })
    const database = join(scratch, name, '.local', 'share', data, 'postgres')
    mkdirSync(database, { recursive: true })
    writeFileSync(join(database, 'PG_VERSION'), '18\n')
    return { earlier, database }
  }

  /** What `service install` did there: its refusal, and what it ran and wrote. */
  const installedOver = async (data: string) => {
    const { earlier, database } = left(`earlier-${data}`, data)
    ran.length = 0
    const refusal = await run(Effect.flip(service.install(earlier, options)))
    return {
      refusal: refusal.message,
      ran: [...ran],
      wrote: [earlier.environment, earlier.units].filter((path) => existsSync(path)),
      database,
    }
  }

  test('an install made with the embedded PostgreSQL is refused, saying how to keep the data', async () => {
    // Under the name of Hippocampe, and under the name Grenier, before it.
    const installs = [await installedOver('hippocampe'), await installedOver('grenier')]
    for (const { refusal, ran: commands, wrote, database } of installs)
      expect({ refusal, commands, wrote }).toEqual({
        refusal: `${database} holds the database of Hippocampe 0.12 or earlier, run by its own PostgreSQL; this version keeps its data in PGlite, inside the server, and changes nothing here. To keep that data, run Hippocampe 0.12 on it (npm install --global @netsirk/hippocampe@0.12, then hippo export:markdown <folder>, or hippo backup), then hippo service uninstall with it, move ${dirname(database)} aside, and install this version again.`,
        commands: [],
        wrote: [],
      })
  })
})

describe('the service is driven by systemd', () => {
  test('start, stop, status and logs', async () => {
    ran.length = 0
    await run(service.start)
    await run(service.stop)
    await run(service.status)
    await run(service.logs)
    expect(ran).toEqual([
      'systemctl --user start hippocampe.service',
      'systemctl --user stop hippocampe.service',
      'systemctl --user status --no-pager hippocampe.service',
      'journalctl --user -u hippocampe.service -n 200 --no-pager',
    ])
  })

  test('backup copies the database and the media, the service stopped for the copy', async () => {
    // The folder of the database as the server left it.
    mkdirSync(join(home.database, 'pgdata'), { recursive: true })
    writeFileSync(join(home.database, 'pgdata', 'PG_VERSION'), '18\n')
    ran.length = 0
    const file = join(scratch, 'copy.tar.gz')
    const said = await run(service.backup(home, file))
    expect(ran).toEqual([
      'systemctl --user stop hippocampe.service',
      expect.stringMatching(
        new RegExp(
          `^tar -czf ${file} -C \\S+ hippocampe-backup\\.json -C ${home.data} pglite media$`,
        ),
      ),
      'systemctl --user start hippocampe.service',
    ])
    expect(said).toBe(`The database and the media are saved in ${file}.`)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test('backup is private before tar writes a byte of the database, whether the file was there or not', async () => {
    const fresh = join(scratch, 'private-fresh.tar.gz')
    await run(service.backup(home, fresh))
    expect(archiveWhenTarRan).toBe(0o600)
    // An archive of an earlier backup, left readable: it is made private before it takes the copy.
    const earlier = join(scratch, 'private-earlier.tar.gz')
    writeFileSync(earlier, 'an earlier archive', { mode: 0o644 })
    chmodSync(earlier, 0o644)
    await run(service.backup(home, earlier))
    expect(archiveWhenTarRan).toBe(0o600)
    expect(statSync(earlier).mode & 0o777).toBe(0o600)
  })

  test('uninstall keeps the data; with purge, nothing is left', async () => {
    ran.length = 0
    expect(await run(service.uninstall(home, false))).toContain('give --purge to delete them')
    expect(existsSync(join(home.units, 'hippocampe.service'))).toBe(false)
    expect(existsSync(home.environment)).toBe(true)
    expect(ran[0]).toBe('systemctl --user disable --now hippocampe.service')
    const purged = await run(service.uninstall(home, true))
    expect(purged).toContain(`Deleted: ${home.data} and ${home.config}.`)
    expect(purged).toContain(`Kept: ${home.kept} (the backups and the export).`)
    expect(existsSync(home.data)).toBe(false)
    expect(existsSync(home.config)).toBe(false)
    expect(existsSync(home.backups)).toBe(true)
  })
})
