import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
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
const media = mkdtempSync(join(tmpdir(), 'hippocampe-inbox-http-'))
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
const keys = { trusted: '', plain: '', reader: '' }

const bearer = (key: string) => ({ authorization: `Bearer ${key}` })

/** The start of a PDF: a file that is not text, and not an image an agent is shown. */
const LEAFLET = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')

/** Sends an item as JSON with a key; the status and the body of the answer. */
const send = async (key: string, item: Schema.JsonObject) => {
  const response = await fetch(`${base}/api/inbox`, {
    method: 'POST',
    headers: { ...bearer(key), 'content-type': 'application/json' },
    body: JSON.stringify(item),
  })
  return { status: response.status, body: await response.json() }
}

/** Sends a file as a multipart upload with a key, with the other fields given. */
const upload = async (
  key: string,
  file: { readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> },
  fields: Readonly<Record<string, string>> = {},
) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  form.append('file', new Blob([file.bytes]), file.name)
  const response = await fetch(`${base}/api/inbox`, {
    method: 'POST',
    headers: bearer(key),
    body: form,
  })
  return { status: response.status, body: await response.json() }
}

const Gave = Schema.Struct({ slug: Schema.String, title: Schema.String, type: Schema.String })

const Sent = Schema.Struct({
  id: Schema.String,
  client_id: Schema.NullOr(Schema.String),
  kind: Schema.String,
  name: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.Number),
  mime: Schema.NullOr(Schema.String),
  origin: Schema.String,
  status: Schema.String,
  reason: Schema.NullOr(Schema.String),
  entries: Schema.Array(Gave),
})
const sentOf = Schema.decodeUnknownSync(Sent)

const Followed = Schema.Struct({
  items: Schema.Array(Schema.Json),
  next_cursor: Schema.NullOr(Schema.String),
})

/** What `GET /api/inbox` answers to a key, for the query given. */
const follow = async (key: string, query: string) => {
  const response = await fetch(`${base}/api/inbox?${query}`, { headers: bearer(key) })
  expect(response.status).toBe(200)
  const { items, next_cursor } = Schema.decodeUnknownSync(Followed)(await response.json())
  return { raw: items, items: items.map((item) => sentOf(item)), next_cursor }
}

beforeAll(async () => {
  const url = await database.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth
      yield* auth.createOwner('owner@example.org', 'Owner')
      keys.trusted = (yield* auth.createKey('agent-trusted', ['read', 'write', 'sensitive'])).secret
      keys.plain = (yield* auth.createKey('agent-plain', ['read', 'write'])).secret
      keys.reader = (yield* auth.createKey('agent-reader', ['read'])).secret
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
  await trusted.call('define_type', {
    name: 'bookmark',
    label: 'Bookmark',
    description: 'A page kept to read again.',
    fields: [],
  })
  await trusted.call('define_type', {
    name: 'diary',
    label: 'Diary',
    description: 'A private day.',
    fields: [],
    sensitive: true,
  })
}, 120_000)

afterAll(async () => {
  server?.kill()
  await database.dispose()
  rmSync(media, { recursive: true, force: true })
})

describe('adding to the inbox over HTTP', () => {
  test('a text, a url and a file are added to the inbox over HTTP', async () => {
    const text = await send(keys.plain, { kind: 'text', text: 'Buy seeds', origin: 'phone-add' })
    const url = await send(keys.plain, {
      kind: 'url',
      url: 'https://example.org/a-page',
      origin: 'phone-add',
    })
    const file = await upload(
      keys.plain,
      { name: 'leaflet.pdf', bytes: LEAFLET },
      { origin: 'phone-add' },
    )
    expect([text.status, url.status, file.status]).toEqual([200, 200, 200])
    expect(sentOf(text.body)).toMatchObject({ kind: 'text', status: 'pending', size: 9 })
    expect(sentOf(url.body)).toMatchObject({ kind: 'url', status: 'pending' })
    expect(sentOf(file.body)).toMatchObject({
      kind: 'file',
      name: 'leaflet.pdf',
      size: LEAFLET.length,
      mime: 'application/pdf',
      status: 'pending',
    })
    // The agent reads them as it reads what came through MCP.
    const agent = await connect(`${base}/mcp`, bearer(keys.trusted))
    expect(await agent.call('inbox_list', { id: sentOf(text.body).id })).toMatchObject({
      result: { item: { text: 'Buy seeds' } },
    })
    expect(await agent.call('inbox_list', { id: sentOf(url.body).id })).toMatchObject({
      result: { item: { url: 'https://example.org/a-page' } },
    })
    expect(await agent.call('inbox_list', { id: sentOf(file.body).id })).toMatchObject({
      result: { item: { name: 'leaflet.pdf', mime: 'application/pdf' } },
    })
  })

  test('an item over HTTP is refused under the same rules as inbox_add', async () => {
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    const refused = [
      { kind: 'text', origin: 'phone-refused' },
      { kind: 'url', url: 'ftp://example.org/file', origin: 'phone-refused' },
      { kind: 'text', text: 'Both', url: 'https://example.org', origin: 'phone-refused' },
    ]
    const over = await Promise.all(refused.map((item) => send(keys.plain, item)))
    const through = await Promise.all(refused.map((item) => agent.call('inbox_add', item)))
    expect(over.map(({ status }) => status)).toEqual([400, 400, 400])
    expect(over.map(({ body }) => body.message)).toEqual(through.map(({ error }) => error))
    expect(through.every(({ error }) => error !== undefined)).toBe(true)
    expect((await follow(keys.plain, 'origin=phone-refused')).items).toEqual([])
  })

  test('a json item without kind is refused in one sentence', async () => {
    const answer = await send(keys.plain, { text: 'Buy seeds', origin: 'phone-nokind' })
    expect(answer).toEqual({
      status: 400,
      body: expect.objectContaining({ message: 'The field `kind` is missing.' }),
    })
    expect((await follow(keys.plain, 'origin=phone-nokind')).items).toEqual([])
    // Without a key, the refusal is the key's, not the payload's.
    expect((await send('', { text: 'Buy seeds' })).status).toBe(401)
  })

  test('an upload without a file is refused in one sentence', async () => {
    const form = new FormData()
    form.append('origin', 'phone-nofile')
    const response = await fetch(`${base}/api/inbox`, {
      method: 'POST',
      headers: bearer(keys.plain),
      body: form,
    })
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 400,
      body: expect.objectContaining({ message: 'The field `file` is missing.' }),
    })
    expect((await follow(keys.plain, 'origin=phone-nofile')).items).toEqual([])
  })

  test('a malformed query is refused in one sentence', async () => {
    const response = await fetch(`${base}/api/inbox?limit=many`, { headers: bearer(keys.plain) })
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 400,
      body: expect.objectContaining({
        message: 'The field `limit` must be a string representing a finite number.',
      }),
    })
  })

  test('a file larger than 20 MB is refused in one sentence', async () => {
    const answer = await upload(
      keys.plain,
      { name: 'big.bin', bytes: new Uint8Array(20 * 1024 * 1024 + 1).fill(1) },
      { origin: 'phone-big' },
    )
    expect(answer).toEqual({
      status: 400,
      body: expect.objectContaining({ message: 'A file sent to the inbox is 20 MB at most.' }),
    })
    expect((await follow(keys.plain, 'origin=phone-big')).items).toEqual([])
  })

  test('a key without the right write may not add to the inbox', async () => {
    const answer = await send(keys.reader, { kind: 'text', text: 'Hello', origin: 'phone-read' })
    expect(answer).toEqual({
      status: 403,
      body: expect.objectContaining({
        message:
          'This key may not write: ask the owner of Hippocampe for a key with the right `write`.',
      }),
    })
    expect((await follow(keys.reader, 'origin=phone-read')).items).toEqual([])
  })

  test('an item sent again with the same client identifier is kept once', async () => {
    const client_id = randomUUID()
    const item = { kind: 'url', url: 'https://example.org/twice', origin: 'phone-twice', client_id }
    const first = await send(keys.plain, item)
    // A retry after a lost answer, and two sends at the same moment.
    const again = await Promise.all([send(keys.plain, item), send(keys.plain, item)])
    for (const answer of [first, ...again]) {
      expect(answer.status).toBe(200)
      expect(answer.body).toEqual(first.body)
    }
    expect(sentOf(first.body).client_id).toBe(client_id)
    const racing = randomUUID()
    const raced = await Promise.all(
      [1, 2, 3].map(() =>
        upload(
          keys.plain,
          { name: 'leaflet.pdf', bytes: LEAFLET },
          { origin: 'phone-twice', client_id: racing, note: 'the same photo' },
        ),
      ),
    )
    expect(new Set(raced.map(({ body }) => sentOf(body).id)).size).toBe(1)
    const { items } = await follow(keys.plain, 'origin=phone-twice')
    expect(items.map(({ client_id: given }) => given).toSorted()).toEqual(
      [client_id, racing].toSorted(),
    )
    // Followed by its identifier too.
    expect((await follow(keys.plain, `client_id=${racing}`)).items).toMatchObject([
      { client_id: racing, kind: 'file' },
    ])
  })

  test('the same client identifier with another content is refused', async () => {
    const client_id = randomUUID()
    await send(keys.plain, { kind: 'text', text: 'First', origin: 'phone-other', client_id })
    const answer = await send(keys.plain, {
      kind: 'text',
      text: 'Second',
      origin: 'phone-other',
      client_id,
    })
    expect(answer).toEqual({
      status: 400,
      body: expect.objectContaining({
        message: `The client identifier \`${client_id}\` names another item already: give each item an identifier of its own.`,
      }),
    })
    expect(
      (await send(keys.plain, { kind: 'text', text: 'Third', client_id: 'not-an-id' })).body,
    ).toMatchObject({ message: 'The client identifier `not-an-id` must be a UUID.' })
    expect((await follow(keys.plain, 'origin=phone-other')).items).toHaveLength(1)
  })
})

describe('a note with the item', () => {
  test('a note travels with the item to the agent that takes it', async () => {
    const { body } = await upload(
      keys.plain,
      { name: 'leaflet.pdf', bytes: LEAFLET },
      { origin: 'phone-note', note: 'keep the serial number' },
    )
    const text = await send(keys.plain, {
      kind: 'text',
      text: 'A board',
      origin: 'phone-note',
      note: 'for the reference board',
    })
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    expect(await agent.call('inbox_list', { origin: 'phone-note' })).toMatchObject({
      result: {
        items: [
          { id: sentOf(body).id, note: 'keep the serial number' },
          { id: sentOf(text.body).id, note: 'for the reference board' },
        ],
      },
    })
    expect(await agent.call('inbox_take', { id: sentOf(body).id })).toMatchObject({
      result: { item: { note: 'keep the serial number' } },
    })
  })

  test('inbox_add and inbox:add take a note', async () => {
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    const added = await agent.call('inbox_add', {
      kind: 'text',
      text: 'Lamp',
      origin: 'mcp-note',
      note: 'the one in the hall',
    })
    expect(added).toMatchObject({ result: { item: { note: 'the one in the hall' } } })
    expect(await agent.call('inbox_list', { origin: 'mcp-note' })).toMatchObject({
      result: { items: [{ note: 'the one in the hall' }] },
    })
  })
})

describe('following what was sent over HTTP', () => {
  test('the items of an origin are listed with their status', async () => {
    const agent = await connect(`${base}/mcp`, bearer(keys.plain))
    // One after the other, so that each arrives after the one before.
    const sent = async (text: string) =>
      sentOf((await send(keys.plain, { kind: 'text', text, origin: 'phone-follow' })).body).id
    const one = await sent('One')
    const two = await sent('Two')
    const three = await sent('Three')
    await sent('Four')
    await agent.call('write', { type: 'bookmark', title: 'Followed page' })
    await agent.call('inbox_take', { id: one })
    await agent.call('inbox_finish', { id: one, outcome: 'done', entries: ['followed-page'] })
    await agent.call('inbox_take', { id: two })
    await agent.call('inbox_finish', { id: two, outcome: 'dismissed', reason: 'a duplicate' })
    await agent.call('inbox_take', { id: three })
    // Newest first, a page at a time.
    const first = await follow(keys.reader, 'origin=phone-follow&limit=3')
    expect(first.items.map(({ status, reason }) => [status, reason])).toEqual([
      ['pending', null],
      ['taken', null],
      ['dismissed', 'a duplicate'],
    ])
    expect(first.next_cursor).not.toBeNull()
    const rest = await follow(
      keys.reader,
      `origin=phone-follow&limit=3&cursor=${first.next_cursor ?? ''}`,
    )
    expect(rest.items).toMatchObject([
      { id: one, status: 'processed', entries: [{ slug: 'followed-page', type: 'bookmark' }] },
    ])
    expect(rest.next_cursor).toBeNull()
  })

  test('a processed item names the entries it gave that the key may read', async () => {
    const trusted = await connect(`${base}/mcp`, bearer(keys.trusted))
    await trusted.call('write', { type: 'bookmark', title: 'Open page' })
    await trusted.call('write', { type: 'diary', title: 'Quiet day' })
    const { id } = sentOf(
      (await send(keys.plain, { kind: 'text', text: 'Both', origin: 'phone-gave' })).body,
    )
    await trusted.call('inbox_take', { id })
    await trusted.call('inbox_finish', { id, outcome: 'done', entries: ['open-page', 'quiet-day'] })
    expect((await follow(keys.trusted, 'origin=phone-gave')).items).toMatchObject([
      {
        entries: [
          { slug: 'open-page', title: 'Open page', type: 'bookmark' },
          { slug: 'quiet-day', title: 'Quiet day', type: 'diary' },
        ],
      },
    ])
    expect((await follow(keys.plain, 'origin=phone-gave')).items).toMatchObject([
      { entries: [{ slug: 'open-page', title: 'Open page', type: 'bookmark' }] },
    ])
  })

  test('a processed item is listed to a key without the right sensitive, without its content', async () => {
    const trusted = await connect(`${base}/mcp`, bearer(keys.trusted))
    await trusted.call('write', { type: 'bookmark', title: 'Kept page' })
    const { id } = sentOf(
      (
        await send(keys.plain, {
          kind: 'text',
          text: 'A private sentence',
          origin: 'phone-hidden',
          note: 'mine',
        })
      ).body,
    )
    await trusted.call('inbox_take', { id })
    await trusted.call('inbox_finish', { id, outcome: 'done', entries: ['kept-page'] })
    const { raw, items } = await follow(keys.plain, 'origin=phone-hidden')
    expect(items).toMatchObject([{ id, status: 'processed', entries: [{ slug: 'kept-page' }] }])
    expect(JSON.stringify(raw)).not.toContain('A private sentence')
    expect(JSON.stringify(raw)).not.toContain('mine')
  })
})
