import { spawn } from 'node:child_process'
import { connect, createServer, type Server } from 'node:net'
import { ConfigProvider, type Duration, Effect, ManagedRuntime, Predicate } from 'effect'
import { afterAll, describe, expect, test } from 'vitest'
import { awaitDatabase, layer as database } from '../../src/core/database/index.ts'
import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'

const APP = new URL('../..', import.meta.url).pathname
const scratch = ManagedRuntime.make(scratchDatabase)
const proxies: Array<Server> = []
afterAll(async () => {
  proxies.forEach((proxy) => proxy.close())
  await scratch.dispose()
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

/** `awaitDatabase` on the database at `url`, as the error it ends with. */
const awaiting = (url: string, wait: Duration.Input) =>
  Effect.runPromise(
    Effect.flip(awaitDatabase(wait)).pipe(
      Effect.provide(database),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ DATABASE_URL: url }))),
    ),
  )

const scratchUrl = () =>
  scratch.runPromise(
    Effect.gen(function* () {
      return (yield* ScratchDatabase).url
    }),
  )

/**
 * The URL of the scratch database as it is reached through a port nothing listens on until
 * `after` milliseconds have passed: a PostgreSQL that is still starting up refuses the same way.
 */
const reachableAfter = async (after: number) => {
  const real = new URL(await scratchUrl())
  const port = await freePort()
  setTimeout(() => {
    const proxy = createServer((client) => {
      const upstream = connect(Number(real.port), real.hostname)
      client.pipe(upstream).pipe(client)
      client.on('error', () => upstream.destroy())
      upstream.on('error', () => client.destroy())
    }).listen(port, '127.0.0.1')
    proxies.push(proxy)
  }, after)
  const late = new URL(real)
  late.port = String(port)
  return late.toString()
}

describe('the server starts while its PostgreSQL is still starting up', () => {
  test('hippo serve waits until the database accepts connections, then migrates and listens', async () => {
    const url = await reachableAfter(2_000)
    const port = await freePort()
    const child = spawn(process.execPath, ['src/serve.ts'], {
      cwd: APP,
      env: {
        PATH: process.env['PATH'] ?? '',
        DATABASE_URL: url,
        PORT: String(port),
        BETTER_AUTH_SECRET: 'a-secret-for-the-tests-only-0123456789abcdef',
        HIPPOCAMPE_INSTANCE: 'local',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer) => {
      output += chunk.toString('utf8')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const said = async (tries: number): Promise<string | undefined> => {
      const found = /Listening on (\S+)/.exec(output)?.[1]
      if (found !== undefined || tries === 0 || child.exitCode !== null) return found
      await new Promise((resolve) => setTimeout(resolve, 50))
      return said(tries - 1)
    }
    try {
      expect(await said(400), output).toBe(`http://127.0.0.1:${port}`)
      expect(output).not.toContain('could not be migrated')
    } finally {
      child.kill()
    }
  }, 30_000)

  test('it gives up in one sentence when the database never accepts a connection', async () => {
    const port = await freePort()
    const error = await awaiting(`postgres://nobody:secret@127.0.0.1:${port}/none`, '1 second')
    expect(error.message).toBe(
      'The database did not accept a connection within 1s: is PostgreSQL running, and is DATABASE_URL its address?',
    )
  }, 30_000)

  test('a wrong password is refused at once, not waited for', async () => {
    const real = new URL(await scratchUrl())
    real.password = 'not-the-password'
    const started = Date.now()
    const error = await awaiting(real.toString(), '20 seconds')
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(error.message).not.toContain('did not accept a connection within')
  }, 30_000)
})
