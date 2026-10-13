import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigProvider, Effect, Latch, Schedule, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { writeEntry } from '../../src/core/entries/index.ts'
import {
  addToInbox,
  keepPosts,
  peekItem,
  PostFetch,
  sendToInbox,
  takeItem,
} from '../../src/core/inbox/index.ts'
import { attachMedia, readMedia } from '../../src/core/media/index.ts'
import { incomingPath, sha256Of } from '../../src/core/media/files.ts'
import { Refused } from '../../src/core/refused.ts'
import { defineType } from '../../src/core/types/index.ts'
import { inboxAddTool, inboxTakeTool } from '../../src/mcp/tools/inbox.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()
const directory = mkdtempSync(join(tmpdir(), 'hippocampe-x-posts-'))

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/x-posts/${name}`, import.meta.url), 'utf8')

const POST = 'https://x.com/harbour_bakery/status/1834567890123456789'
const SYNDICATION = 'https://cdn.syndication.twimg.com/tweet-result?id='
const FXTWITTER = 'https://api.fxtwitter.com/'
const LOAF = 'https://pbs.twimg.com/media/LoafPhoto.jpg'
const POSTER = 'https://pbs.twimg.com/ext_tw_video_thumb/5100/pu/img/OvenPoster.jpg'

/** Two images made for the tests, told apart by their colour. */
const images = new Map<string, Uint8Array>()
const imageOf = (background: string) =>
  sharp({ create: { width: 2, height: 2, channels: 3, background } })
    .png()
    .toBuffer()
    .then((bytes) => new Uint8Array(bytes))

/**
 * The endpoints as a test records them: `pageOf` gives the body a URL answers, or nothing for a
 * 404; an image is answered from `images`. Every URL asked is kept in `asked`.
 */
const recorded = (pageOf: (url: string) => string | undefined) => {
  const asked: Array<string> = []
  const fetch: PostFetch = {
    page: (url) =>
      Effect.suspend(() => {
        asked.push(url)
        const body = pageOf(url)
        return body === undefined
          ? Effect.fail(new Refused({ message: `\`${url}\` answered 404.` }))
          : Effect.succeed(body)
      }),
    file: (url) =>
      Effect.gen(function* () {
        asked.push(url)
        const bytes = images.get(url)
        if (bytes === undefined)
          return yield* new Refused({ message: `The URL \`${url}\` answered 404.` })
        const path = yield* incomingPath()
        yield* Effect.promise(() => writeFile(path, bytes))
        return { path, sha256: sha256Of(bytes), size: bytes.length }
      }),
  }
  return { fetch, asked }
}

/** Runs with the media kept in this suite's own folder, and the endpoints of `fetch`. */
const withPosts =
  (fetch: PostFetch) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provide(
      Effect.provideService(effect, PostFetch, fetch),
      ConfigProvider.layer(ConfigProvider.fromUnknown({ MEDIA_DIR: directory })),
    )

/** Syndication answers every post with the recorded one; fxtwitter is never needed. */
const syndicationOnly = (body: string) => (url: string) =>
  url.startsWith(SYNDICATION) ? body : undefined

const Image = Schema.Struct({
  url: Schema.String,
  sha256: Schema.String,
  mime: Schema.String,
  media_url: Schema.String,
})
const Kept = Schema.Struct({
  posts: Schema.Array(
    Schema.Struct({
      url: Schema.String,
      status: Schema.String,
      copy: Schema.NullOr(Schema.Struct({ images: Schema.Array(Image) })),
    }),
  ),
})
const decodeKept = Schema.decodeUnknownSync(Kept)

/** Reads an item until `done` holds of it: the copy is made by a fiber of its own. */
const until = <A, E, R>(read: Effect.Effect<A, E, R>, done: (value: A) => boolean) =>
  read.pipe(
    Effect.repeat({ schedule: Schedule.spaced('20 millis'), until: done }),
    Effect.timeout('5 seconds'),
  )

beforeAll(async () => {
  images.set(LOAF, await imageOf('#c8a165'))
  images.set(POSTER, await imageOf('#3b3b3b'))
  await run(defineType({ name: 'bake', label: 'Bake', description: 'A loaf baked.', fields: [] }))
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('a post on X that reaches the inbox', () => {
  test('a link to a post on X is kept with its text, author, date and images', async () => {
    const { fetch } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST, origin: 'phone' }), ({ id }) =>
          keepPosts(id),
        ),
      ),
    )
    const read = await run(withPosts(fetch)(peekItem(item.id)))
    expect(read).toMatchObject({
      url: POST,
      posts: [
        {
          url: POST,
          status: 'kept',
          source: 'syndication',
          reason: null,
          copy: {
            id: '1834567890123456789',
            url: POST,
            author: { name: 'Harbour Bakery', handle: 'harbour_bakery' },
            created_at: '2026-09-14T08:30:00.000Z',
            text: 'The rye loaf is back on Saturdays, baked in the old oven.',
            quoted: null,
          },
        },
      ],
    })
    const [post] = decodeKept(read).posts
    expect(post?.copy?.images.map(({ url }) => url)).toEqual([LOAF, POSTER])
    const kept = post?.copy?.images ?? []
    for (const image of kept) {
      expect(image).toMatchObject({ mime: 'image/png', media_url: `/media/${image.sha256}` })
    }
    // Served while the item waits, to a key that may work the inbox.
    const served = await run(
      withPosts(fetch)(Effect.forEach(kept, ({ sha256 }) => readMedia(sha256))),
    )
    expect(served.map(({ mime }) => mime)).toEqual(['image/png', 'image/png'])
    // The answer of the endpoint, as it came.
    const answers = await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql<{ answer: string }>`SELECT answer FROM inbox_posts WHERE item_id = ${item.id}`,
      ),
    )
    expect(answers.map(({ answer }) => answer)).toEqual([fixture('syndication-post.json')])
  })

  test('the quoted post is kept with the post', async () => {
    const quoting = 'https://x.com/valley_mill/status/1834567890123450001'
    const { fetch } = recorded(syndicationOnly(fixture('syndication-quote.json')))
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: quoting }), ({ id }) => keepPosts(id)),
      ),
    )
    const read = await run(withPosts(fetch)(peekItem(item.id)))
    expect(read).toMatchObject({
      posts: [
        {
          status: 'kept',
          copy: {
            author: { handle: 'valley_mill' },
            text: 'Our flour went into this one.',
            images: [],
            quoted: {
              id: '1834567890123456789',
              url: POST,
              author: { name: 'Harbour Bakery', handle: 'harbour_bakery' },
              created_at: '2026-09-14T08:30:00.000Z',
              text: 'The rye loaf is back on Saturdays, baked in the old oven.',
              images: [{ url: LOAF, mime: 'image/png' }],
            },
          },
        },
      ],
    })
  })

  test('a post shared from the app with its query string is recognised', async () => {
    const { fetch, asked } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const shared = [
      `${POST}?s=46&t=Ab3dEf9hIjK`,
      'https://mobile.twitter.com/harbour_bakery/status/1834567890123456789?s=20',
      'https://twitter.com/harbour_bakery/status/1834567890123456789/photo/1',
    ]
    const read = await run(
      withPosts(fetch)(
        Effect.forEach(shared, (url) =>
          addToInbox({ kind: 'url', url }).pipe(
            Effect.tap(({ id }) => keepPosts(id)),
            Effect.flatMap(({ id }) => peekItem(id)),
          ),
        ),
      ),
    )
    // Each item keeps the link as it was shared; the post is named by its plain address.
    expect(read).toMatchObject(
      shared.map((url) => ({ url, posts: [{ url: POST, status: 'kept' }] })),
    )
    expect(asked.filter((url) => url.startsWith(SYNDICATION))).toHaveLength(3)
  })

  test('fxtwitter is asked when the syndication endpoint fails', async () => {
    const { fetch, asked } = recorded((url) =>
      url === `${FXTWITTER}harbour_bakery/status/1834567890123456789`
        ? fixture('fxtwitter-post.json')
        : undefined,
    )
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(asked[0]).toMatch(
      /^https:\/\/cdn\.syndication\.twimg\.com\/tweet-result\?id=1834567890123456789&token=\w+$/,
    )
    expect(asked[1]).toBe(`${FXTWITTER}harbour_bakery/status/1834567890123456789`)
    expect(await run(withPosts(fetch)(peekItem(item.id)))).toMatchObject({
      posts: [
        {
          status: 'kept',
          source: 'fxtwitter',
          copy: {
            author: { name: 'Harbour Bakery', handle: 'harbour_bakery' },
            created_at: '2026-09-14T08:30:00.000Z',
            text: 'The rye loaf is back on Saturdays, baked in the old oven.',
            images: [{ url: LOAF, mime: 'image/png' }],
            quoted: null,
          },
        },
      ],
    })
  })

  test('a copy that fails is noted on the item and the link stays', async () => {
    const { fetch } = recorded((url) =>
      url.startsWith(SYNDICATION)
        ? fixture('syndication-tombstone.json')
        : fixture('fxtwitter-missing.html'),
    )
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST }), ({ id }) => keepPosts(id)),
      ),
    )
    const taken = await run(withPosts(fetch)(takeItem({ id: item.id })))
    expect(taken).toMatchObject({
      url: POST,
      posts: [
        {
          url: POST,
          status: 'failed',
          copy: null,
          reason:
            'The post could not be copied: cdn.syndication.twimg.com did not answer a post; api.fxtwitter.com did not answer a post.',
        },
      ],
    })
  })

  test('a link to another site is left as it is', async () => {
    const { fetch, asked } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const others = [
      'https://example.org/harbour_bakery/status/1834567890123456789',
      'https://fxtwitter.com/harbour_bakery/status/1834567890123456789',
      'https://x.com/harbour_bakery',
    ]
    const read = await run(
      withPosts(fetch)(
        Effect.forEach(others, (url) =>
          addToInbox({ kind: 'url', url }).pipe(
            Effect.tap(({ id }) => keepPosts(id)),
            Effect.flatMap(({ id }) => peekItem(id)),
          ),
        ),
      ),
    )
    expect(read).toMatchObject(others.map((url) => ({ url })))
    expect(read.filter((item) => 'posts' in item)).toEqual([])
    expect(asked).toEqual([])
  })

  test('every post in a text item is kept, up to the limit', async () => {
    const { fetch } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const ids = ['11', '12', '13', '14', '15', '16', '17']
    const text = [
      'Bakeries to visit:',
      ...ids.map((id) => `https://x.com/harbour_bakery/status/${id}?s=20`),
      // The same post again is kept once.
      'https://twitter.com/harbour_bakery/status/11',
    ].join('\n')
    const item = await run(
      withPosts(fetch)(Effect.tap(addToInbox({ kind: 'text', text }), ({ id }) => keepPosts(id))),
    )
    const posts = decodeKept(await run(withPosts(fetch)(peekItem(item.id)))).posts
    expect(posts.map(({ url }) => url)).toEqual(
      ids.slice(0, 5).map((id) => `https://x.com/harbour_bakery/status/${id}`),
    )
    expect(posts.map(({ status }) => status)).toEqual(Array(5).fill('kept'))
  })

  test('adding an item does not wait for the copy', async () => {
    const gate = Latch.makeUnsafe(false)
    const { fetch } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const held: PostFetch = { ...fetch, page: (url) => gate.whenOpen(fetch.page(url)) }
    // Over HTTP, and through `inbox_add`: each answers while the endpoints have not.
    const sent = await run(withPosts(held)(sendToInbox({ kind: 'url', url: POST })))
    const added = Schema.decodeUnknownSync(
      Schema.Struct({ item: Schema.Struct({ id: Schema.String }) }),
    )(await run(withPosts(held)(inboxAddTool.run({ kind: 'url', url: POST })))).item
    const ids = [sent.id, added.id]
    expect(await run(withPosts(held)(Effect.forEach(ids, peekItem)))).toMatchObject([
      { posts: [{ status: 'pending', copy: null }] },
      { posts: [{ status: 'pending', copy: null }] },
    ])
    await run(gate.open)
    const kept = await run(
      withPosts(held)(
        Effect.forEach(ids, (id) =>
          until(peekItem(id), (item) =>
            decodeKept(item).posts.every(({ status }) => status === 'kept'),
          ),
        ),
      ),
    )
    expect(kept).toMatchObject([{ posts: [{ status: 'kept' }] }, { posts: [{ status: 'kept' }] }])
  })

  test('the agent that takes the item is given the copy', async () => {
    const { fetch } = recorded(syndicationOnly(fixture('syndication-post.json')))
    // Added without its copy, as when the server stopped before making it: the take makes it.
    const item = await run(withPosts(fetch)(addToInbox({ kind: 'url', url: POST })))
    const taken = await run(withPosts(fetch)(takeItem({ id: item.id })))
    expect(taken).toMatchObject({
      status: 'taken',
      posts: [
        {
          status: 'kept',
          copy: {
            author: { handle: 'harbour_bakery' },
            text: 'The rye loaf is back on Saturdays, baked in the old oven.',
          },
        },
      ],
    })
    expect(inboxTakeTool.description).toContain('`posts`')
  })

  test('a kept image is attached to an entry without fetching it again', async () => {
    const { fetch, asked } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const item = await run(withPosts(fetch)(addToInbox({ kind: 'url', url: POST })))
    const taken = await run(withPosts(fetch)(takeItem({ id: item.id })))
    const [loaf] = decodeKept(taken).posts[0]?.copy?.images ?? []
    if (loaf === undefined) throw new Error('the image of the post was not kept')
    await run(writeEntry({ type: 'bake', title: 'Saturday rye' }))
    const before = asked.length
    const { media } = await run(
      withPosts(fetch)(
        attachMedia({
          entry: 'saturday-rye',
          item: item.id,
          sha256: loaf.sha256,
          alt: 'A rye loaf',
        }),
      ),
    )
    expect(media).toMatchObject({ kind: 'image', mime: 'image/png', sha256: loaf.sha256 })
    expect(asked).toHaveLength(before)
  })
})

describe('a long post on X', () => {
  const FX_URL = `${FXTWITTER}harbour_bakery/status/1834567890123456789`
  const FX_QUOTING_URL = `${FXTWITTER}valley_mill/status/1834567890123450001`
  const QUOTING = 'https://x.com/valley_mill/status/1834567890123450001'
  const WHOLE = JSON.parse(fixture('fxtwitter-long.json')).tweet.text
  const CUT = JSON.parse(fixture('syndication-long.json')).text

  const answerRow = (itemId: string) =>
    run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) =>
          sql<{
            source: string
            answer: string
          }>`SELECT source, answer FROM inbox_posts WHERE item_id = ${itemId}`,
      ),
    )

  test('the copy holds the whole text from fxtwitter and the images from syndication', async () => {
    const { fetch, asked } = recorded((url) =>
      url.startsWith(SYNDICATION)
        ? fixture('syndication-long.json')
        : url === FX_URL
          ? fixture('fxtwitter-long.json')
          : undefined,
    )
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(asked.filter((url) => url.startsWith(FXTWITTER))).toEqual([FX_URL])
    const read = await run(withPosts(fetch)(peekItem(item.id)))
    expect(read).toMatchObject({
      posts: [
        {
          status: 'kept',
          copy: {
            author: { name: 'Harbour Bakery', handle: 'harbour_bakery' },
            created_at: '2026-09-14T08:30:00.000Z',
            text: WHOLE,
            truncated: false,
            images: [{ url: LOAF, mime: 'image/png' }],
            quoted: null,
          },
        },
      ],
    })
    expect(WHOLE).not.toBe(CUT)
    // The row says where each part came from, and keeps both answers as they came.
    const [row] = await answerRow(item.id)
    expect(row?.source).toBe('syndication+fxtwitter')
    expect(JSON.parse(row?.answer ?? '')).toEqual({
      syndication: fixture('syndication-long.json'),
      fxtwitter: fixture('fxtwitter-long.json'),
    })
  })

  test('the copy keeps the syndication text and says it is cut when fxtwitter fails', async () => {
    const { fetch } = recorded(syndicationOnly(fixture('syndication-long.json')))
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(await run(withPosts(fetch)(peekItem(item.id)))).toMatchObject({
      posts: [{ status: 'kept', source: 'syndication', copy: { text: CUT, truncated: true } }],
    })
    const [row] = await answerRow(item.id)
    expect(row).toEqual({ source: 'syndication', answer: fixture('syndication-long.json') })
  })

  test('a long quoted post is given whole from the post that quotes it', async () => {
    const { fetch } = recorded((url) =>
      url.startsWith(SYNDICATION)
        ? fixture('syndication-long-quote.json')
        : url === FX_QUOTING_URL
          ? fixture('fxtwitter-long-quote.json')
          : undefined,
    )
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: QUOTING }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(await run(withPosts(fetch)(peekItem(item.id)))).toMatchObject({
      posts: [
        {
          status: 'kept',
          copy: {
            text: 'Our flour went into this one.',
            truncated: false,
            quoted: { text: WHOLE, truncated: false },
          },
        },
      ],
    })
  })

  test('a long quoted post is said to be cut when fxtwitter fails', async () => {
    const { fetch } = recorded(syndicationOnly(fixture('syndication-long-quote.json')))
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: QUOTING }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(await run(withPosts(fetch)(peekItem(item.id)))).toMatchObject({
      posts: [
        {
          status: 'kept',
          copy: { truncated: false, quoted: { text: CUT, truncated: true } },
        },
      ],
    })
  })

  test('a short post does not ask fxtwitter and is not cut', async () => {
    const { fetch, asked } = recorded(syndicationOnly(fixture('syndication-post.json')))
    const item = await run(
      withPosts(fetch)(
        Effect.tap(addToInbox({ kind: 'url', url: POST }), ({ id }) => keepPosts(id)),
      ),
    )
    expect(asked.filter((url) => url.startsWith(FXTWITTER))).toEqual([])
    expect(await run(withPosts(fetch)(peekItem(item.id)))).toMatchObject({
      posts: [{ source: 'syndication', copy: { truncated: false } }],
    })
  })

  test('the description of the posts says what truncated means', () => {
    expect(inboxTakeTool.description).toContain('`truncated`')
  })
})
