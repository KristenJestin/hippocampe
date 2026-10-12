import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, ManagedRuntime, Predicate } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'

/*
 * The local mode, as `hippo service install` runs Hippocampe on a workstation: the server runs its
 * own PostgreSQL, the one the package carries, as a child, on a Unix socket in the database folder.
 */

const APP = new URL('../..', import.meta.url).pathname
const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-local-'))
const folder = join(scratch, 'postgres')
const database = ManagedRuntime.make(scratchDatabase)
afterAll(async () => {
  await database.dispose()
  rmSync(scratch, { recursive: true, force: true })
})

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        resolve(address !== null && !Predicate.isString(address) ? address.port : 0),
      )
    })
  })

let port = 0
beforeAll(async () => {
  port = await freePort()
})

/** The environment of the service in local mode: no `DATABASE_URL`. */
const local = (more: Readonly<Record<string, string>> = {}) => ({
  PATH: process.env['PATH'] ?? '',
  HOME: join(scratch, 'home'),
  HIPPOCAMPE_INSTANCE: 'local',
  HIPPOCAMPE_DATABASE_DIR: folder,
  PORT: String(port),
  BETTER_AUTH_SECRET: 'a-secret-for-the-tests-only-0123456789abcdef',
  MEDIA_DIR: join(scratch, 'media'),
  ...more,
})

/** A command of the command line, as another process. */
const hippo = (environment: Readonly<Record<string, string>>, ...args: ReadonlyArray<string>) => {
  const ran = spawnSync(process.execPath, ['src/cli.ts', ...args], {
    cwd: APP,
    env: environment,
    encoding: 'utf8',
  })
  return { code: ran.status, out: ran.stdout, err: ran.stderr.trim() }
}

/** What `postmaster.pid` says of the PostgreSQL that holds the folder; nothing when none does. */
const postmaster = () => {
  const file = join(folder, 'postmaster.pid')
  if (!existsSync(file)) return undefined
  const lines = readFileSync(file, 'utf8').split('\n')
  return { pid: Number(lines[0]), sockets: lines[4], listening: lines[5], status: lines[7]?.trim() }
}

/** The parent of a process, from `/proc`. */
const parentOf = (pid: number) =>
  Number(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.split(' ')[1])

const alive = (pid: number) => existsSync(`/proc/${pid}`)

/** The process of the PostgreSQL that holds the folder; the test fails when none does. */
const holder = () => {
  const pid = postmaster()?.pid
  if (pid === undefined || !(pid > 0)) throw new Error('No PostgreSQL holds the folder.')
  return pid
}

type Running = { readonly child: ChildProcess; readonly output: () => string }

/** `hippo serve`, until it answers /health or stops. */
const serve = async (environment: Readonly<Record<string, string>>): Promise<Running> => {
  const child = spawn(process.execPath, ['src/cli.ts', 'serve'], {
    cwd: APP,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  const running = { child, output: () => output }
  const healthy = async (tries: number): Promise<Running> => {
    if (child.exitCode !== null) return running
    if (tries === 0) throw new Error(`hippo serve did not answer /health: ${output}`)
    const answered = await fetch(`http://127.0.0.1:${environment['PORT']}/health`).then(
      (response) => response.ok,
      () => false,
    )
    if (answered) return running
    await new Promise((resolve) => setTimeout(resolve, 100))
    return healthy(tries - 1)
  }
  return healthy(600)
}

/** The code a process ended with, once it has. */
const ended = (child: ChildProcess) =>
  child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise<number | null>((resolve) => child.once('exit', (code) => resolve(code)))

/** The secret a `key:create` printed, alone on its last line. */
const secretOf = (output: string) => output.trim().split('\n').at(-1)?.trim() ?? ''

let server: Running | undefined
afterAll(async () => {
  if (server !== undefined && server.child.exitCode === null) {
    server.child.kill('SIGTERM')
    await ended(server.child)
  }
})

describe('Hippocampe runs its own PostgreSQL in local mode', () => {
  test('the local mode runs its PostgreSQL as a child, on a socket, with no database port', async () => {
    server = await serve(local())
    expect(server.child.exitCode).toBeNull()
    const held = postmaster()
    expect(held).toMatchObject({ sockets: folder, listening: '', status: 'ready' })
    expect(parentOf(holder())).toBe(server.child.pid)
    expect(existsSync(join(folder, '.s.PGSQL.5432'))).toBe(true)
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json()
    expect(health).toMatchObject({ status: 'up', instance: 'local' })
  })

  let secret = ''

  test('a command reaches the database of the running server', async () => {
    const before = postmaster()?.pid
    const created = hippo(
      local(),
      'key:create',
      '--name',
      'agent-desk',
      '--rights',
      'read,write',
      '--owner',
      'owner@example.org',
    )
    expect(created).toMatchObject({ code: 0, err: '' })
    secret = secretOf(created.out)
    // The PostgreSQL of the server, still: the command started none.
    expect(postmaster()?.pid).toBe(before)
    const about = await fetch(`http://127.0.0.1:${port}/api/about`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(about.status).toBe(200)
  })

  test('a folder held by another PostgreSQL is refused in one sentence', async () => {
    const other = await serve(local({ PORT: String(await freePort()) }))
    expect(await ended(other.child)).toBe(1)
    expect(other.output().trim()).toBe(
      `The database folder ${folder} is in use by another PostgreSQL (process ${postmaster()?.pid}): stop it first (hippo service stop), or give another folder.`,
    )
  })

  test('the server stops its PostgreSQL cleanly when it stops', async () => {
    const running = server
    const postgres = holder()
    expect(alive(postgres)).toBe(true)
    running?.child.kill('SIGTERM')
    if (running !== undefined) await ended(running.child)
    expect(alive(postgres)).toBe(false)
    // A clean shutdown removes its lock: no recovery at the next start.
    expect(postmaster()).toBeUndefined()
    expect(running?.output()).toContain('database system is shut down')
  })

  test('a command starts and stops the database itself when the server is stopped', () => {
    const listed = hippo(local(), 'key:list')
    expect(listed).toMatchObject({ code: 0, err: '' })
    expect(listed.out).toContain('agent-desk')
    expect(postmaster()).toBeUndefined()
    expect(hippo(local(), 'key:revoke', '--name', 'agent-desk')).toMatchObject({ code: 0 })
    expect(hippo(local(), 'key:list').out).toMatch(/agent-desk.*revoked/)
  })

  test('the server exits when its PostgreSQL ends on its own', async () => {
    server = await serve(local())
    const postgres = holder()
    process.kill(postgres, 'SIGKILL')
    expect(await ended(server.child)).toBe(1)
    expect(server.output()).toMatch(/^PostgreSQL ended on its own \(signal SIGKILL\)/m)
  })
})

describe('the mode is chosen, never guessed', () => {
  test('both modes at once are refused in one sentence', () => {
    const both = hippo(
      local({ DATABASE_URL: 'postgres://hippocampe@127.0.0.1:1/postgres' }),
      'serve',
    )
    expect(both.code).toBe(1)
    expect(both.err).toBe(
      'Both DATABASE_URL and HIPPOCAMPE_DATABASE_DIR are set: keep DATABASE_URL to reach a PostgreSQL that runs elsewhere, or HIPPOCAMPE_DATABASE_DIR for the one Hippocampe runs itself, not both.',
    )
  })

  test('the external mode never starts a database', async () => {
    // A PostgreSQL that only says it was started, where Hippocampe would look for one.
    const binaries = join(scratch, 'never')
    const started = join(scratch, 'started')
    mkdirSync(join(binaries, 'bin'), { recursive: true })
    for (const name of ['postgres', 'initdb']) {
      writeFileSync(join(binaries, 'bin', name), `#!/bin/sh\ntouch "${started}"\nexit 1\n`)
      chmodSync(join(binaries, 'bin', name), 0o755)
    }
    const url = await database.runPromise(Effect.map(ScratchDatabase, (made) => made.url))
    const { HIPPOCAMPE_DATABASE_DIR: _, ...external } = local({
      DATABASE_URL: url,
      HIPPOCAMPE_POSTGRES_BINARIES: binaries,
      PORT: String(await freePort()),
    })
    const running = await serve(external)
    expect(running.child.exitCode).toBeNull()
    expect(hippo(external, 'key:list')).toMatchObject({ code: 0, err: '' })
    running.child.kill('SIGTERM')
    await ended(running.child)
    expect(existsSync(started)).toBe(false)
  })
})
