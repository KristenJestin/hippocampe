import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigProvider, Effect, Latch, Schedule, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { readEntry, writeEntry } from '../../src/core/entries/index.ts'
import {
  addToInbox,
  finishItem,
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
import { inboxAddTool, inboxFinishTool, inboxTakeTool } from '../../src/mcp/tools/inbox.ts'
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

/** The sentence a refused effect fails with. */
const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

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

describe('closing a link to a post with attach', () => {
  /** The item taken, then closed with `attach` on an entry; what the refusal says, and what stayed. */
  const finishedWithAttach = async (body: string, url: string) => {
    const { fetch } = recorded(syndicationOnly(body))
    const item = await run(withPosts(fetch)(addToInbox({ kind: 'url', url })))
    const taken = await run(withPosts(fetch)(takeItem({ id: item.id })))
    await run(writeEntry({ type: 'bake', title: `Bake of ${item.id}`, slug: `bake-${item.id}` }))
    const refused = await run(
      withPosts(fetch)(
        refusalOf(
          finishItem({
            id: item.id,
            entries: [{ entry: `bake-${item.id}`, attach: { alt: 'A loaf' } }],
          }),
        ),
      ),
    )
    const after = await run(withPosts(fetch)(peekItem(item.id)))
    const entry = await run(readEntry(`bake-${item.id}`))
    return { id: item.id, taken, refused, after, entry }
  }

  test('a link whose post holds images is refused with attach_media, the item and each sha256', async () => {
    const { id, taken, refused, after, entry } = await finishedWithAttach(
      fixture('syndication-post.json'),
      POST,
    )
    const hashes = (decodeKept(taken).posts[0]?.copy?.images ?? []).map(({ sha256 }) => sha256)
    expect(hashes).toHaveLength(2)
    expect(refused).toBe(
      `The item \`${id}\` holds no file to attach. Attach the images of its posts with \`attach_media\`: \`item\` \`${id}\` and \`sha256\` ${hashes.map((hash) => `\`${hash}\``).join(' or ')}.`,
    )
    expect(after).toMatchObject({ status: 'taken' })
    expect(entry.entry.sources).not.toContainEqual({ source: 'inbox', item: id })
    expect(entry.media).toEqual([])
  })

  test('the images of a quoted post are named too', async () => {
    const { id, refused } = await finishedWithAttach(
      fixture('syndication-quote.json'),
      'https://x.com/valley_mill/status/1834567890123450001',
    )
    expect(refused).toContain(`\`attach_media\``)
    expect(refused).toContain(`\`item\` \`${id}\``)
    expect(refused).toMatch(/`sha256` `[0-9a-f]{64}`\.$/)
  })

  test('a link whose post holds no image is refused, saying only a file item can be attached', async () => {
    const { id, refused, after } = await finishedWithAttach(
      fixture('syndication-text-only.json'),
      'https://x.com/harbour_bakery/status/1834567890123450002',
    )
    expect(refused).toBe(
      `The item \`${id}\` holds no file to attach: only a file item can be attached this way.`,
    )
    expect(after).toMatchObject({ status: 'taken' })
  })

  test('a link whose post could not be copied is refused, saying only a file item can be attached', async () => {
    const { id, refused } = await finishedWithAttach(fixture('syndication-tombstone.json'), POST)
    expect(refused).toBe(
      `The item \`${id}\` holds no file to attach: only a file item can be attached this way.`,
    )
  })

  test('the description of inbox_finish says attach is for a file item and points to attach_media', () => {
    expect(inboxFinishTool.description).toContain('an item that is a file')
    expect(inboxFinishTool.description).toContain('`attach_media`')
  })
})

describe('the links of a post on X', () => {
  const POST_ID = (n: number) => `https://x.com/harbour_bakery/status/183456789012345000${n}`
  const FX_LONG = `${FXTWITTER}harbour_bakery/status/1834567890123456789`
  const FX = (n: number) => `${FXTWITTER}harbour_bakery/status/183456789012345000${n}`

  const Linked = Schema.Struct({
    status: Schema.String,
    source: Schema.NullOr(Schema.String),
    copy: Schema.NullOr(
      Schema.Struct({
        links: Schema.optionalKey(Schema.Array(Schema.String)),
        quoted: Schema.NullOr(
          Schema.Struct({ links: Schema.optionalKey(Schema.Array(Schema.String)) }),
        ),
      }),
    ),
  })

  /** The post at `url` copied from what `pageOf` answers, then read as an agent takes it. */
  const copied = async (url: string, pageOf: (url: string) => string | undefined) => {
    const { fetch } = recorded(pageOf)
    const item = await run(
      withPosts(fetch)(Effect.tap(addToInbox({ kind: 'url', url }), ({ id }) => keepPosts(id))),
    )
    const taken = await run(withPosts(fetch)(takeItem({ id: item.id })))
    const [post] = Schema.decodeUnknownSync(Schema.Struct({ posts: Schema.Array(Linked) }))(
      taken,
    ).posts
    expect(post?.status).toBe('kept')
    return post
  }

  const fromSyndication = (name: string) => syndicationOnly(fixture(name))
  const fromFxtwitter = (name: string, n: number) => (url: string) =>
    url === FX(n) ? fixture(name) : undefined

  test('a link in the text of a post is kept with its expanded address, from syndication', async () => {
    const post = await copied(POST_ID(3), fromSyndication('syndication-link.json'))
    expect(post).toMatchObject({
      source: 'syndication',
      copy: { links: ['https://kneader.example.org/pro'] },
    })
  })

  test('a link in the text of a post is kept with its expanded address, from fxtwitter', async () => {
    const post = await copied(POST_ID(3), fromFxtwitter('fxtwitter-link.json', 3))
    expect(post).toMatchObject({
      source: 'fxtwitter',
      copy: { links: ['https://kneader.example.org/pro'] },
    })
  })

  test('the link card of a post is kept with its address, from syndication', async () => {
    const post = await copied(POST_ID(4), fromSyndication('syndication-card.json'))
    // The card and the text name the same page: kept once, by its expanded address.
    expect(post?.copy?.links).toEqual(['https://dough-timer.example.org/'])
  })

  test('the link card of a post is kept with its address, from fxtwitter', async () => {
    const post = await copied(POST_ID(4), fromFxtwitter('fxtwitter-card.json', 4))
    expect(post?.copy?.links).toEqual(['https://dough-timer.example.org/'])
  })

  test('a card whose address the text does not expand is kept as the card gives it', async () => {
    const post = await copied(POST_ID(5), fromSyndication('syndication-card-only.json'))
    expect(post?.copy?.links).toEqual(['https://t.co/C4rdLink02'])
  })

  test('a post with only an image keeps no link, from syndication', async () => {
    const post = await copied(POST_ID(6), fromSyndication('syndication-image-only.json'))
    expect(post).toMatchObject({ source: 'syndication', copy: { links: [] } })
  })

  test('a post with only an image keeps no link, from fxtwitter', async () => {
    const post = await copied(POST_ID(6), fromFxtwitter('fxtwitter-image-only.json', 6))
    expect(post).toMatchObject({ source: 'fxtwitter', copy: { links: [] } })
  })

  test('the quoted post is not a link of the post that quotes it, and keeps its own links', async () => {
    const post = await copied(
      'https://x.com/valley_mill/status/1834567890123450007',
      fromSyndication('syndication-quote-link.json'),
    )
    expect(post?.copy).toMatchObject({
      links: ['https://valley-mill.example.org/flour'],
      quoted: { links: ['https://oven.example.org/old'] },
    })
  })

  test('a long post keeps the links of the whole text and of the cut one', async () => {
    const cut = {
      ...JSON.parse(fixture('syndication-long.json')),
      entities: {
        urls: [{ url: 'https://t.co/Th1sOne001', expanded_url: 'https://mill.example.org/' }],
      },
    }
    const whole = JSON.parse(fixture('fxtwitter-long.json'))
    whole.tweet.raw_text = {
      facets: [
        {
          type: 'url',
          original: 'https://t.co/Th4tOne001',
          replacement: 'https://stone.example.org/',
        },
        {
          type: 'url',
          original: 'https://t.co/Th1sOne001',
          replacement: 'https://mill.example.org/',
        },
      ],
    }
    const post = await copied(POST, (url) =>
      url.startsWith(SYNDICATION)
        ? JSON.stringify(cut)
        : url === FX_LONG
          ? JSON.stringify(whole)
          : undefined,
    )
    expect(post).toMatchObject({ source: 'syndication+fxtwitter' })
    expect(post?.copy?.links).toEqual(['https://stone.example.org/', 'https://mill.example.org/'])
  })

  test('a copy kept before the links were, still reads, without links', async () => {
    const { fetch } = recorded(fromSyndication('syndication-post.json'))
    const item = await run(withPosts(fetch)(addToInbox({ kind: 'url', url: POST })))
    await run(withPosts(fetch)(takeItem({ id: item.id })))
    // The copy as it was kept before: no `links`.
    await run(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`UPDATE inbox_posts SET copy = copy - 'links' WHERE item_id = ${item.id}`,
      ),
    )
    const read = await run(withPosts(fetch)(peekItem(item.id)))
    expect(JSON.stringify(read)).not.toContain('"links"')
    expect(read).toMatchObject({ posts: [{ status: 'kept', copy: { text: expect.any(String) } }] })
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
