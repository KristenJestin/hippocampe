import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigProvider, Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { databaseReachable } from '../../src/core/database/index.ts'
import { homeOf } from '../../src/local/home.ts'
import * as service from '../../src/local/service.ts'
import { binariesForTests, postgresForTests } from './postgres.ts'

/*
 * An installation made by 0.6.0 to 0.12.x: its PostgreSQL ran in a unit of its own, on a port of
 * `127.0.0.1`, from a copy of the binaries, with a password.
 */

const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-one-unit-'))
const home = homeOf({ HOME: join(scratch, 'home') })
const PASSWORD = 'a-password-for-the-tests-only'
const options = { email: 'owner@example.org', instance: 'local', port: 7468 }

/** Each command the service ran. */
const ran: Array<string> = []

/** systemd is faked: what it was told is kept. */
const system = Layer.succeed(service.System, {
  run: (command, args) =>
    Effect.sync(() => {
      ran.push([command, ...args].join(' '))
      return { code: 0, output: '' }
    }),
  answers: () => Effect.succeed(true),
})
const run = <A, E>(effect: Effect.Effect<A, E, service.System>) =>
  Effect.runPromise(effect.pipe(Effect.provide(system)))

let binaries: Awaited<ReturnType<typeof binariesForTests>>

/** What the database answers to `statements`, in the single-user mode of PostgreSQL. */
const asked = (statements: ReadonlyArray<string>) =>
  execFileSync(binaries.binary('postgres'), ['--single', '-D', home.database, 'postgres'], {
    encoding: 'utf8',
    env: { ...process.env, ...binaries.environment },
    input: `${statements.join('\n')}\n`,
    stdio: 'pipe',
  })

const environmentBefore = [
  'HIPPOCAMPE_INSTANCE=local',
  'HIPPOCAMPE_HOST=127.0.0.1',
  'PORT=7468',
  `DATABASE_URL=postgres://hippocampe:${PASSWORD}@127.0.0.1:7469/postgres`,
  'BETTER_AUTH_SECRET=a-secret-for-the-tests-only',
  `MEDIA_DIR=${home.media}`,
  `EXPORT_DIR=${home.export}`,
  '',
].join('\n')

beforeAll(async () => {
  binaries = await binariesForTests()
  process.env['HIPPOCAMPE_EXECUTABLE'] = '/opt/hippocampe/bin/hippo'
  for (const folder of [home.units, home.config, join(home.binaries, 'bin'), home.media])
    mkdirSync(folder, { recursive: true })
  writeFileSync(join(home.binaries, 'bin', 'postgres'), '')
  // The database as `service install` made it then: a role and its password, SCRAM, one table.
  const passwordFile = join(scratch, 'password')
  writeFileSync(passwordFile, PASSWORD)
  execFileSync(
    binaries.binary('initdb'),
    [
      '-D',
      home.database,
      '-U',
      'hippocampe',
      `--pwfile=${passwordFile}`,
      '-A',
      'scram-sha-256',
      '-E',
      'UTF8',
      '--locale=C',
    ],
    { env: { ...process.env, ...binaries.environment }, stdio: 'pipe' },
  )
  asked([
    'CREATE TABLE notes (title text NOT NULL)',
    "INSERT INTO notes VALUES ('Lantern by the door')",
  ])
  writeFileSync(home.environment, environmentBefore, { mode: 0o600 })
  writeFileSync(home.key, 'hippocampe_a-key-for-the-tests\n', { mode: 0o600 })
  writeFileSync(
    join(home.units, 'hippocampe-postgres.service'),
    '[Unit]\nDescription=The database of Hippocampe\n',
  )
  writeFileSync(join(home.units, 'hippocampe.service'), '[Unit]\nDescription=Hippocampe\n')
})

afterAll(async () => {
  await binaries.release()
  delete process.env['HIPPOCAMPE_EXECUTABLE']
  rmSync(scratch, { recursive: true, force: true })
})

describe('hippo service install, on an installation made with two units', () => {
  test('an install made with two units is moved to one, keeping its data', async () => {
    const said = await run(service.install(home, options))
    expect(readdirSync(home.units)).toEqual(['hippocampe.service'])
    expect(readFileSync(join(home.units, 'hippocampe.service'), 'utf8')).toContain(' serve')
    expect(ran.slice(0, 2)).toEqual([
      'systemctl --user disable --now hippocampe-postgres.service',
      'systemctl --user daemon-reload',
    ])
    expect(readFileSync(home.environment, 'utf8')).toBe(
      environmentBefore.replace(/^DATABASE_URL=.*$/m, `HIPPOCAMPE_DATABASE_DIR=${home.database}`),
    )
    expect(existsSync(home.binaries)).toBe(false)
    // What it changed, one line each.
    expect(said.split('\n').slice(0, 3)).toEqual([
      'Stopped and removed the unit hippocampe-postgres.service: the server runs its PostgreSQL itself now.',
      `Updated ${home.environment}: DATABASE_URL is replaced by HIPPOCAMPE_DATABASE_DIR=${home.database}, the same database, reached through its socket.`,
      `Removed ${home.binaries}, the copy of PostgreSQL the database unit ran: the server runs the one of its package.`,
    ])
    // The server's PostgreSQL opens the folder, and the core reaches it through its socket.
    const postgres = await postgresForTests(home.database)
    const reachable = await Effect.runPromise(
      databaseReachable.pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({ env: { HIPPOCAMPE_DATABASE_DIR: home.database } }),
          ),
        ),
      ),
    )
    await postgres.release()
    expect(reachable).toBe(true)
    expect(asked(['SELECT title FROM notes'])).toContain('title = "Lantern by the door"')
  })

  test('installed again, it moves nothing, says nothing of it, and changes nothing', async () => {
    const environment = readFileSync(home.environment, 'utf8')
    ran.length = 0
    const again = await run(service.install(home, options))
    expect(again).not.toMatch(/Stopped|Updated|Removed/)
    expect(ran.some((line) => line.includes('hippocampe-postgres'))).toBe(false)
    expect(readFileSync(home.environment, 'utf8')).toBe(environment)
    expect(readdirSync(home.units)).toEqual(['hippocampe.service'])
  })
})
