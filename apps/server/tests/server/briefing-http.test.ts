import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigProvider, Effect, Layer, ManagedRuntime, Predicate, Schema } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { Auth } from '../../src/core/auth/index.ts'
import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'
import { connect } from './http-client.ts'

const APP = new URL('../..', import.meta.url).pathname
const SECRET = 'a-secret-for-the-tests-only-0123456789abcdef'
const media = mkdtempSync(join(tmpdir(), 'hippocampe-briefing-http-'))
const database = ManagedRuntime.make(
  Layer.provideMerge(
    Auth.layer.pipe(
      Layer.provide(
        ConfigProvider.layer(ConfigProvider.fromUnknown({ BETTER_AUTH_SECRET: SECRET })),
      ),
    ),
    scratchDatabase,
  ),
)

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() =>
        resolve(address !== null && !Predicate.isString(address) ? address.port : 0),
      )
    })
  })

let server: ChildProcess | undefined
let base = ''
const keys = { trusted: '', plain: '', writer: '', phone: '' }

const bearer = (key: string) => ({ authorization: `Bearer ${key}` })

/** The day `days` from today, as the server (in the time zone of the process) reads it. */
const inDays = (days: number) => {
  const day = new Date()
  day.setDate(day.getDate() + days)
  return [day.getFullYear(), day.getMonth() + 1, day.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-')
}

const Entry = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  type: Schema.String,
})
const Occurrence = Schema.Struct({
  id: Schema.String,
  entry: Entry,
  field: Schema.String,
  date: Schema.String,
  period: Schema.String,
  days_left: Schema.NullOr(Schema.Number),
  age: Schema.NullOr(Schema.Number),
  deadline: Schema.Boolean,
})
const Waiting = <A extends Schema.Top>(first: A) =>
  Schema.Struct({ count: Schema.Int, first: Schema.Array(first) })
const Briefing = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  upcoming: Schema.Array(Occurrence),
  overdue: Schema.Array(Occurrence),
  heads_up: Schema.Array(Occurrence),
  waiting: Schema.Struct({
    inbox: Waiting(Schema.Struct({ id: Schema.String, origin: Schema.String })),
    supposed: Waiting(Schema.Struct({ slug: Schema.String, what: Schema.String })),
    pending_references: Waiting(Schema.Struct({ slug: Schema.String })),
  }),
})

/** What `GET /api/briefing` answers to a key, for the query given. */
const get = async (key: string | undefined, query = '') => {
  const response = await fetch(`${base}/api/briefing${query}`, {
    headers: key === undefined ? {} : bearer(key),
  })
  return { status: response.status, body: await response.json() }
}

/** The briefing a key reads, decoded; the request must succeed. */
const briefed = async (key: string, query = '') => {
  const { status, body } = await get(key, query)
  expect(status).toBe(200)
  return Schema.decodeUnknownSync(Briefing)(body)
}

/** Runs one step after the other, since the order they happen in is what is looked at. */
const inOrder = <A>(items: ReadonlyArray<A>, each: (item: A) => Promise<void>) =>
  items.reduce((previous, item) => previous.then(() => each(item)), Promise.resolve())

const slugs = (found: ReadonlyArray<{ readonly entry: { readonly slug: string } }>) =>
  found.map(({ entry }) => entry.slug)

beforeAll(async () => {
  const url = await database.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth
      yield* auth.createOwner('owner@example.org', 'Owner')
      keys.trusted = (yield* auth.createKey('agent-trusted', ['read', 'write', 'sensitive'])).secret
      keys.plain = (yield* auth.createKey('agent-plain', ['read', 'write'])).secret
      keys.writer = (yield* auth.createKey('agent-writer', ['write'])).secret
      keys.phone = (yield* auth.createKey('agent-phone', ['read'])).secret
      return (yield* ScratchDatabase).url
    }),
  )
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['src/serve.ts'], {
    cwd: APP,
    env: {
      PATH: process.env['PATH'] ?? '',
      DATABASE_URL: url,
      PORT: String(port),
      BETTER_AUTH_SECRET: SECRET,
      MEDIA_DIR: media,
      HIPPOCAMPE_INSTANCE: 'local',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const up = async (tries: number): Promise<void> => {
    const ok = await fetch(`${base}/health`).then(
      (response) => response.ok,
      () => false,
    )
    if (ok) return
    if (tries === 0) throw new Error('the server did not start')
    await new Promise((resolve) => setTimeout(resolve, 100))
    return up(tries - 1)
  }
  await up(300)
  const trusted = await connect(`${base}/mcp`, bearer(keys.trusted))
  const typed = [
    {
      name: 'permit',
      label: 'Permit',
      description: 'A permit that ends.',
      fields: [{ name: 'ends', kind: 'date', due: { notice: 'P5D' } }],
    },
    {
      name: 'warranty',
      label: 'Warranty',
      description: 'A warranty that ends.',
      fields: [{ name: 'ends', kind: 'date', due: { notice: 'P1D' } }],
    },
    {
      name: 'policy',
      label: 'Policy',
      description: 'A policy whose end is kept private.',
      fields: [
        { name: 'ends', kind: 'date', due: { notice: 'P5D' }, sensitive: true },
        { name: 'renewed', kind: 'date', due: { notice: 'P5D' } },
      ],
    },
    {
      name: 'diary',
      label: 'Diary',
      description: 'A private day.',
      fields: [{ name: 'ends', kind: 'date', due: { notice: 'P5D' } }],
      sensitive: true,
    },
    { name: 'note', label: 'Note', description: 'A free note.', fields: [] },
  ]
  await inOrder(typed, async (type) => {
    await trusted.call('define_type', type)
  })
  const written = [
    // Due in the week and inside its notice.
    {
      type: 'permit',
      title: 'Boat permit',
      fields: { ends: inDays(2) },
      provenance: { ends: 'inferred' },
    },
    // Due beyond the week, inside no notice.
    {
      type: 'warranty',
      title: 'Kettle warranty',
      fields: { ends: inDays(20) },
      provenance: { ends: 'inferred' },
    },
    // A date the key may not see, and a date it may.
    {
      type: 'policy',
      title: 'Tent policy',
      fields: { ends: inDays(2), renewed: inDays(3) },
      provenance: { ends: 'inferred', renewed: 'inferred' },
    },
    {
      type: 'diary',
      title: 'Secret diary',
      fields: { ends: inDays(2) },
      provenance: { ends: 'inferred' },
    },
    // Something that waits: a reference without an entry, and a supposition.
    {
      type: 'note',
      title: 'Dangling',
      body: 'See [[not-written-yet]].',
      provenance: { body: 'inferred' },
    },
  ]
  await inOrder(written, async (entry) => {
    const answer = await trusted.call('write', entry)
    if ('error' in answer) throw new Error(`could not write ${entry.title}: ${answer.error}`)
  })
}, 120_000)

afterAll(async () => {
  server?.kill()
  await database.dispose()
  rmSync(media, { recursive: true, force: true })
})

describe('the briefing over HTTP', () => {
  test('the briefing over HTTP gives what is due in the period', async () => {
    const today = await briefed(keys.trusted, '?period=today')
    expect(today).toMatchObject({ from: inDays(0), to: inDays(0), upcoming: [] })
    const week = await briefed(keys.trusted, '?period=week')
    expect(week).toMatchObject({ from: inDays(0), to: inDays(6) })
    expect(slugs(week.upcoming)).toEqual([
      'boat-permit',
      'secret-diary',
      'tent-policy',
      'tent-policy',
    ])
    expect(week.upcoming.find(({ entry }) => entry.slug === 'boat-permit')).toEqual({
      id: expect.any(String),
      entry: expect.objectContaining({ slug: 'boat-permit', title: 'Boat permit', type: 'permit' }),
      field: 'ends',
      date: inDays(2),
      period: inDays(2),
      days_left: 2,
      age: null,
      deadline: true,
    })
    // Without a period, today.
    expect(await briefed(keys.trusted)).toMatchObject({ from: inDays(0), to: inDays(0) })
    const weekend = await briefed(keys.trusted, '?period=weekend')
    expect(weekend.from <= weekend.to).toBe(true)
  })

  test('the briefing over HTTP refuses a period that is not one', async () => {
    expect((await get(keys.phone, '?period=month')).status).toBe(400)
  })

  test('the briefing over HTTP gives the heads-ups before a due date', async () => {
    const found = await briefed(keys.plain)
    // Inside its notice: the permit (5 days, due in 2). The kettle's is 20 days away, its notice 1.
    expect(slugs(found.heads_up)).toEqual(['boat-permit', 'tent-policy'])
    const [permit] = found.heads_up
    expect(permit).toMatchObject({ entry: { slug: 'boat-permit' }, field: 'ends', date: inDays(2) })
    // The identity of an occurrence is the same each time it is read: the phone knows it was told.
    const again = await briefed(keys.plain)
    expect(again.heads_up).toEqual(found.heads_up)
    expect(permit?.id).toBe(`${permit?.entry.id}:ends:${inDays(2)}`)
    // Reading it over HTTP does not tell it to the agents: their next answer still brings it.
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    expect(await agent.call('types', {})).toMatchObject({
      result: {
        heads_up: [{ entry: { slug: 'boat-permit' } }, { entry: { slug: 'tent-policy' } }],
      },
    })
  })

  test('the briefing over HTTP counts what waits in the inbox', async () => {
    const empty = await briefed(keys.phone)
    expect(empty.waiting.inbox).toEqual({ count: 0, first: [] })
    const origins = ['phone-a', 'phone-b', 'phone-c', 'phone-d', 'phone-e', 'phone-f', 'phone-g']
    await inOrder(origins, async (origin) => {
      const response = await fetch(`${base}/api/inbox`, {
        method: 'POST',
        headers: { ...bearer(keys.plain), 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'text', text: `Item of ${origin}`, origin }),
      })
      expect(response.status).toBe(200)
    })
    const waiting = (await briefed(keys.phone)).waiting
    expect(waiting.inbox.count).toBe(7)
    expect(waiting.inbox.first.map(({ origin }) => origin)).toEqual([
      'phone-a',
      'phone-b',
      'phone-c',
      'phone-d',
      'phone-e',
    ])
    expect(waiting.pending_references).toMatchObject({
      count: 1,
      first: [{ slug: 'not-written-yet' }],
    })
    expect(waiting.supposed.count).toBeGreaterThanOrEqual(1)
  })

  test('an entry the key may not read is left out of the briefing', async () => {
    const trusted = await briefed(keys.trusted, '?period=week')
    const plain = await briefed(keys.plain, '?period=week')
    const seen = (found: ReadonlyArray<typeof Occurrence.Type>) =>
      found.map(({ entry, field }) => `${entry.slug} ${field}`)
    expect(seen(trusted.upcoming)).toEqual(
      expect.arrayContaining(['secret-diary ends', 'tent-policy ends', 'tent-policy renewed']),
    )
    // Neither the sensitive type nor the sensitive field, in what is due or in the heads-ups.
    expect(seen(plain.upcoming)).toEqual(['boat-permit ends', 'tent-policy renewed'])
    expect(seen(plain.heads_up)).toEqual(['boat-permit ends', 'tent-policy renewed'])
    expect(seen(trusted.heads_up)).toContain('secret-diary ends')
    expect(JSON.stringify(plain)).not.toContain('secret-diary')
  })

  test('a key without the right read may not read the briefing', async () => {
    expect(await get(keys.writer)).toEqual({
      status: 403,
      body: expect.objectContaining({
        message:
          'This key may not read: ask the owner of Hippocampe for a key with the right `read`.',
      }),
    })
    expect((await get(undefined)).status).toBe(401)
    expect((await get('not-a-key')).status).toBe(401)
  })

  test('the MCP briefing and the HTTP briefing agree', async () => {
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    // What both give, whole: the dates and what waits, as the briefing computes them.
    const Shared = Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      upcoming: Schema.Array(Schema.Json),
      overdue: Schema.Array(Schema.Json),
      waiting: Schema.Struct({ supposed: Schema.Json, pending_references: Schema.Json }),
    })
    const over = Schema.decodeUnknownSync(Shared)((await get(keys.plain, '?period=week')).body)
    const answer = await agent.call('briefing', { period: 'week' })
    if (!('result' in answer)) throw new Error('the briefing was refused')
    const through = Schema.decodeUnknownSync(Shared)(answer.result)
    // The HTTP occurrence adds its identity.
    const withoutId = (each: Schema.Json) =>
      Predicate.isObject(each) && !Array.isArray(each)
        ? Object.fromEntries(Object.entries(each).filter(([name]) => name !== 'id'))
        : each
    expect(through.upcoming).not.toEqual([])
    expect({
      ...over,
      upcoming: over.upcoming.map(withoutId),
      overdue: over.overdue.map(withoutId),
    }).toEqual(through)
  })
})
