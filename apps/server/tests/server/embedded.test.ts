import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Predicate } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { connect } from './http-client.ts'

/*
 * Hippocampe on PGlite, as `hippo service install` runs it: the database is a folder, opened by
 * the server itself, and the command line reaches it through the server while it runs.
 */

const APP = new URL('../..', import.meta.url).pathname
const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-embedded-'))
const folder = join(scratch, 'pglite')
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

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

/** The environment of the service, with no PostgreSQL anywhere: no `DATABASE_URL`. */
const environment = () => ({
  PATH: process.env['PATH'] ?? '',
  HOME: join(scratch, 'home'),
  HIPPOCAMPE_INSTANCE: 'local',
  HIPPOCAMPE_DATABASE_DIR: folder,
  PORT: String(port),
  BETTER_AUTH_SECRET: 'a-secret-for-the-tests-only-0123456789abcdef',
  MEDIA_DIR: join(scratch, 'media'),
})

/** A command of the command line, as another process. */
const hippo = (...args: ReadonlyArray<string>) => {
  const ran = spawnSync(process.execPath, ['src/cli.ts', ...args], {
    cwd: APP,
    env: environment(),
    encoding: 'utf8',
  })
  return { code: ran.status, output: `${ran.stdout}${ran.stderr}` }
}

/** The process that holds the folder, by its lock; none when no one does. */
const holder = () => {
  const lock = join(folder, 'hippocampe.pid')
  return existsSync(lock) ? Number(readFileSync(lock, 'utf8')) : undefined
}

let server: ChildProcess | undefined

const startServer = async () => {
  const child = spawn(process.execPath, ['src/serve.ts'], {
    cwd: APP,
    env: environment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')))
  server = child
  const healthy = async (tries: number): Promise<ChildProcess> => {
    if (child.exitCode !== null) throw new Error(`hippo serve stopped: ${output}`)
    if (tries === 0) throw new Error(`hippo serve did not answer /health: ${output}`)
    const answered = await fetch(`http://127.0.0.1:${port}/health`).then(
      (response) => response.ok,
      () => false,
    )
    if (answered) return child
    await new Promise((resolve) => setTimeout(resolve, 100))
    return healthy(tries - 1)
  }
  return healthy(600)
}

const stopServer = async () => {
  const child = server
  if (child === undefined || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    child.kill('SIGTERM')
  })
}

/** The secret a `key:create` printed, alone on its last line. */
const secretOf = (output: string) => output.trim().split('\n').at(-1)?.trim() ?? ''

beforeAll(async () => {
  port = await freePort()
})
afterAll(stopServer)

describe('Hippocampe on PGlite', () => {
  test('the embedded database serves the server in one process', async () => {
    const child = await startServer()
    // The process that serves HTTP holds the database itself: nothing runs beside it.
    expect(holder()).toBe(child.pid)
    expect(existsSync(join(folder, '.s.PGSQL.5432'))).toBe(true)
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json()
    expect(health).toMatchObject({ status: 'up', instance: 'local' })
  })

  let secret = ''

  test('a command reaches the database through the running server', async () => {
    const created = hippo(
      'key:create',
      '--name',
      'agent-desk',
      '--rights',
      'read,write',
      '--owner',
      'owner@example.org',
    )
    expect(created).toMatchObject({ code: 0 })
    secret = secretOf(created.output)
    // The server still holds the folder, and knows the key the command wrote.
    expect(holder()).toBe(server?.pid)
    const about = await fetch(`http://127.0.0.1:${port}/api/about`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(about.status).toBe(200)
  })

  test('two writes at once through the server are applied one after the other, nothing lost', async () => {
    const agent = await connect(`http://127.0.0.1:${port}/mcp`, {
      authorization: `Bearer ${secret}`,
    })
    const other = await connect(`http://127.0.0.1:${port}/mcp`, {
      authorization: `Bearer ${secret}`,
    })
    await agent.call('define_type', {
      name: 'plant',
      label: 'Plant',
      description: 'A plant kept at home.',
      fields: [
        { name: 'light', kind: 'text' },
        { name: 'water', kind: 'text' },
      ],
    })
    await agent.call('write', { type: 'plant', title: 'Fern by the window' })
    const written = await Promise.all([
      agent.call('write', {
        entry: 'fern-by-the-window',
        fields: { light: 'shade' },
        provenance: { light: 'inferred' },
      }),
      other.call('write', {
        entry: 'fern-by-the-window',
        fields: { water: 'weekly' },
        provenance: { water: 'inferred' },
      }),
    ])
    expect(written).toEqual([
      expect.objectContaining({ result: expect.anything() }),
      expect.objectContaining({ result: expect.anything() }),
    ])
    expect(await agent.call('read', { entry: 'fern-by-the-window' })).toMatchObject({
      result: { entry: { fields: { light: 'shade', water: 'weekly' } } },
    })
  })

  test('a command opens the folder itself when the server is stopped', async () => {
    await stopServer()
    expect(holder()).toBeUndefined()
    const listed = hippo('key:list')
    expect(listed).toMatchObject({ code: 0 })
    expect(listed.output).toContain('agent-desk')
    // Done, it leaves the folder to whoever comes next.
    expect(holder()).toBeUndefined()
    expect(hippo('key:revoke', '--name', 'agent-desk')).toMatchObject({ code: 0 })
    await startServer()
    const about = await fetch(`http://127.0.0.1:${port}/api/about`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(about.status).toBe(401)
  })
})
