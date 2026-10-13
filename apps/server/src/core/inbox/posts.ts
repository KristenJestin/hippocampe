import { rm } from 'node:fs/promises'
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { Context, Effect, Option, Schema } from 'effect'
import { drizzle } from '../database/client.ts'
import { rowsOf } from '../database/rows.ts'
import * as tables from '../database/schema.ts'
import { fetchFile, headOf, keepFile, typeOf } from '../media/files.ts'
import { Refused } from '../refused.ts'

/** How many posts of one item are kept: the first ones it names. */
export const POSTS_LIMIT = 5

/** How long a copy may take, beside the add or within a take; past it, the post waits. */
const COPY_TIME = '1 minute'

/** How long an endpoint may take to answer. */
const PAGE_TIMEOUT = 15_000

/**
 * A link to a post on X, as it is shared: `x.com` or `twitter.com`, `mobile.` or `www.` or
 * neither, with or without its scheme, and whatever follows the id (`?s=20`, `/photo/1`). Not a
 * host that merely ends the same way, such as `fxtwitter.com`.
 */
const POST_LINK =
  /(?<![\w.-])(?:https?:\/\/)?(?:(?:www|mobile)\.)?(?:x|twitter)\.com\/(\w{1,15})\/status\/(\d{1,20})(?!\d)/gi

/** The posts on X a text links to, each once, by its plain address, `POSTS_LIMIT` at most. */
export const postsIn = (text: string) => {
  const seen = new Map<string, string>()
  for (const [, handle = '', id = ''] of text.matchAll(POST_LINK)) {
    if (!seen.has(id)) seen.set(id, `https://x.com/${handle}/status/${id}`)
  }
  return [...seen.values()].slice(0, POSTS_LIMIT)
}

/**
 * How the endpoints are reached: `page` gives the body of what a URL answers (200 only), `file`
 * fetches a file to disk as `fetchFile` does. A test gives recorded answers, so that no test
 * reaches the network.
 */
export interface PostFetch {
  readonly page: (url: string) => Effect.Effect<string, Refused>
  readonly file: typeof fetchFile
}

const pageOf = (url: string) => {
  const { host } = new URL(url)
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT) })
      return { status: response.status, body: await response.text() }
    },
    catch: () => new Refused({ message: `${host} could not be reached` }),
  }).pipe(
    Effect.flatMap(({ status, body }) =>
      status === 200
        ? Effect.succeed(body)
        : Effect.fail(new Refused({ message: `${host} answered ${status}` })),
    ),
  )
}

export const PostFetch = Context.Reference<PostFetch>('@hippocampe/core/inbox/PostFetch', {
  defaultValue: () => ({ page: pageOf, file: fetchFile }),
})

/** The token the embedded posts of X send with an id, computed as Vercel's `react-tweet` does. */
const tokenOf = (id: string) =>
  ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '')

const SyndicationFields = {
  id_str: Schema.String,
  text: Schema.String,
  created_at: Schema.String,
  user: Schema.Struct({ name: Schema.String, screen_name: Schema.String }),
  // A photo, or the poster of a video or a GIF.
  mediaDetails: Schema.optionalKey(Schema.Array(Schema.Struct({ media_url_https: Schema.String }))),
  // Marks a long post (a "note"): its `text` stops mid-sentence, and the whole of it is not here.
  note_tweet: Schema.optionalKey(Schema.Struct({ id: Schema.String })),
  // The links of the text, each a `t.co` address (`url`) and the address it leads to. The photos
  // of the post are in `entities.media`, not here.
  entities: Schema.optionalKey(
    Schema.Struct({
      urls: Schema.optionalKey(
        Schema.Array(Schema.Struct({ url: Schema.String, expanded_url: Schema.String })),
      ),
    }),
  ),
  // The link card: the `t.co` address of the page it shows.
  card: Schema.optionalKey(Schema.NullOr(Schema.Struct({ url: Schema.String }))),
}

/** What `cdn.syndication.twimg.com` answers of a post, as far as a copy needs it. */
const Syndication = Schema.Struct({
  __typename: Schema.Literal('Tweet'),
  ...SyndicationFields,
  quoted_tweet: Schema.optionalKey(Schema.Struct(SyndicationFields)),
})

const FxFields = {
  id: Schema.String,
  text: Schema.String,
  created_timestamp: Schema.Number,
  author: Schema.Struct({ name: Schema.String, screen_name: Schema.String }),
  // The text as written, with its links as facets: a `url` facet leads from the `t.co` address
  // (`original`) to the page (`replacement`); a `media` facet is a photo, not a link.
  raw_text: Schema.optionalKey(
    Schema.Struct({
      facets: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            type: Schema.String,
            original: Schema.optionalKey(Schema.String),
            replacement: Schema.optionalKey(Schema.String),
          }),
        ),
      ),
    }),
  ),
  // The link card, `null` when the post has none: `url` is the address of its page.
  card: Schema.optionalKey(Schema.NullOr(Schema.Struct({ url: Schema.String }))),
  media: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        photos: Schema.optionalKey(Schema.Array(Schema.Struct({ url: Schema.String }))),
        videos: Schema.optionalKey(Schema.Array(Schema.Struct({ thumbnail_url: Schema.String }))),
      }),
    ),
  ),
}

/** What `api.fxtwitter.com` answers of a post, as far as a copy needs it. */
const Fx = Schema.Struct({
  code: Schema.Literal(200),
  tweet: Schema.Struct({
    ...FxFields,
    quote: Schema.optionalKey(Schema.NullOr(Schema.Struct(FxFields))),
  }),
})

/** A post as both endpoints are read: its images by their address, not fetched yet. */
interface Read {
  readonly id: string
  readonly handle: string
  readonly name: string
  readonly created_at: string
  readonly text: string
  /** The text is only the beginning of a long post. */
  readonly truncated: boolean
  readonly images: ReadonlyArray<string>
  /** The addresses the post links to, each once. */
  readonly links: ReadonlyArray<string>
}

/** A photo of the post lives at a `pic.x.com` address: an image, not a link. */
const MEDIA_LINK = /^(?:https?:\/\/)?pic\.(?:x|twitter)\.com\//i

/**
 * The addresses a post links to, each once and in order, `quoted` being the id of the post it
 * quotes: neither the post's own photos nor the quoted post are links, they are `images` and
 * `quoted`.
 */
const linksIn = (addresses: ReadonlyArray<string>, quoted: string | undefined) => [
  ...new Set(
    addresses.filter(
      (address) =>
        !MEDIA_LINK.test(address) &&
        (quoted === undefined ||
          !postsIn(address).some((post) => post.endsWith(`/status/${quoted}`))),
    ),
  ),
]

/**
 * The addresses the links of a post lead to, then its card's, each once: `links` pairs a `t.co`
 * address with the page it leads to. A card shows the page of a link of the text, or another page:
 * it is given by the address its endpoint gives, expanded when the text says it.
 */
const linksOf = (
  links: ReadonlyArray<readonly [string, string]>,
  card: string | undefined,
  quoted: string | undefined,
) =>
  linksIn(
    [
      ...links.map(([, page]) => page),
      ...(card === undefined ? [] : [new Map(links).get(card) ?? card]),
    ],
    quoted,
  )

/**
 * `whole` is the full text of a long post, from fxtwitter, when it could be had: its links come
 * first, those of the cut text after. `quoted` is the id of the post it quotes.
 */
const fromSyndication = (
  post: Schema.Struct<typeof SyndicationFields>['Type'],
  whole: Read | undefined,
  quoted?: string,
): Read => ({
  id: post.id_str,
  handle: post.user.screen_name,
  name: post.user.name,
  created_at: new Date(post.created_at).toISOString(),
  text: whole?.text ?? post.text,
  truncated: post.note_tweet !== undefined && whole === undefined,
  images: (post.mediaDetails ?? []).map(({ media_url_https }) => media_url_https),
  links: [
    ...new Set([
      ...(whole?.links ?? []),
      ...linksOf(
        (post.entities?.urls ?? []).map(({ url, expanded_url }) => [url, expanded_url]),
        post.card?.url,
        quoted,
      ),
    ]),
  ],
})

const fromFx = (post: Schema.Struct<typeof FxFields>['Type'], quoted?: string): Read => ({
  id: post.id,
  handle: post.author.screen_name,
  name: post.author.name,
  created_at: new Date(post.created_timestamp * 1000).toISOString(),
  text: post.text,
  truncated: false,
  images: [
    ...(post.media?.photos ?? []).map(({ url }) => url),
    ...(post.media?.videos ?? []).map(({ thumbnail_url }) => thumbnail_url),
  ],
  links: linksOf(
    (post.raw_text?.facets ?? []).flatMap(({ type, original, replacement }) =>
      type === 'url' && original !== undefined && replacement !== undefined
        ? [[original, replacement] as const]
        : [],
    ),
    post.card?.url,
    quoted,
  ),
})

/** An image of a post: kept by its hash, or why it could not be. */
const KeptImage = Schema.Union([
  Schema.Struct({
    url: Schema.String,
    sha256: Schema.String,
    mime: Schema.String,
    size: Schema.Number,
    media_url: Schema.String,
  }),
  Schema.Struct({ url: Schema.String, reason: Schema.String }),
])

const CopyFields = {
  id: Schema.String,
  url: Schema.String,
  author: Schema.Struct({ name: Schema.String, handle: Schema.String }),
  created_at: Schema.String,
  text: Schema.String,
  // Absent from the copies made before it existed.
  truncated: Schema.optionalKey(Schema.Boolean),
  images: Schema.Array(KeptImage),
  // The addresses the post links to; absent from the copies made before it existed.
  links: Schema.optionalKey(Schema.Array(Schema.String)),
}

/** What an agent reads of a post kept: the post, and the one it quotes. */
const PostCopy = Schema.Struct({
  ...CopyFields,
  quoted: Schema.NullOr(Schema.Struct(CopyFields)),
})

/** An image fetched, typed from its content and kept by its hash; never a failure. */
const keptImage = Effect.fn('keptImage')(function* (url: string) {
  const fetch = yield* PostFetch
  return yield* Effect.gen(function* () {
    const fetched = yield* fetch.file(url)
    const head = yield* headOf(fetched.path)
    const { mime } = yield* typeOf(head).pipe(
      Effect.tapError(() => Effect.promise(() => rm(fetched.path, { force: true }))),
    )
    yield* keepFile(fetched.path, fetched.sha256)
    const { sha256, size } = fetched
    return { url, sha256, mime, size, media_url: `/media/${sha256}` }
  }).pipe(Effect.catch(({ message }) => Effect.succeed({ url, reason: message })))
})

const copyOfRead = Effect.fn('copyOfRead')(function* (read: Read) {
  return {
    id: read.id,
    url: `https://x.com/${read.handle}/status/${read.id}`,
    author: { name: read.name, handle: read.handle },
    created_at: read.created_at,
    text: read.text,
    truncated: read.truncated,
    images: yield* Effect.forEach(read.images, keptImage),
    links: read.links,
  }
})

/** The body an endpoint answered, read as a post; refused in one sentence when it is not one. */
const answered = <S extends Schema.Top & { readonly DecodingServices: never }>(
  page: Effect.Effect<string, Refused>,
  schema: S,
  host: string,
) =>
  Effect.flatMap(page, (answer) =>
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(answer).pipe(
      Effect.mapError(() => new Refused({ message: `${host} did not answer a post` })),
      Effect.map((post) => ({ answer, post })),
    ),
  )

/**
 * The copy of a post: asked first of the endpoint behind the embedded posts of X, then of
 * fxtwitter when it fails; the answer as it came, and what an agent reads of it, its images kept.
 * Refused, with what each endpoint did, when neither gives the post.
 *
 * Syndication cuts a long post (a `note_tweet`) short: its whole text, and that of a long post it
 * quotes, is then taken from fxtwitter, the rest staying from syndication. The row says it
 * (`source` is `syndication+fxtwitter`, `answer` holds both bodies, as they came); when fxtwitter
 * does not answer, the text stays the cut one and the copy is `truncated`.
 */
const copyOf = Effect.fn('copyOf')(function* (url: string) {
  const fetch = yield* PostFetch
  const [, handle = '', id = ''] = /^https:\/\/x\.com\/(\w+)\/status\/(\d+)$/.exec(url) ?? []
  const fromFxtwitter = answered(
    fetch.page(`https://api.fxtwitter.com/${handle}/status/${id}`),
    Fx,
    'api.fxtwitter.com',
  )
  const read = yield* answered(
    fetch.page(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tokenOf(id)}`),
    Syndication,
    'cdn.syndication.twimg.com',
  ).pipe(
    Effect.flatMap(({ answer, post }) => {
      const long = post.note_tweet !== undefined || post.quoted_tweet?.note_tweet !== undefined
      return Effect.map(long ? Effect.option(fromFxtwitter) : Effect.succeedNone, (whole) => {
        const full = Option.getOrUndefined(whole)
        const quote = full?.post.tweet.quote
        return {
          source: full === undefined ? 'syndication' : 'syndication+fxtwitter',
          answer:
            full === undefined
              ? answer
              : JSON.stringify({ syndication: answer, fxtwitter: full.answer }),
          read: fromSyndication(
            post,
            post.note_tweet === undefined || full === undefined
              ? undefined
              : fromFx(full.post.tweet, post.quoted_tweet?.id_str),
            post.quoted_tweet?.id_str,
          ),
          quoted:
            post.quoted_tweet === undefined
              ? undefined
              : fromSyndication(
                  post.quoted_tweet,
                  post.quoted_tweet.note_tweet === undefined ||
                    quote === undefined ||
                    quote === null
                    ? undefined
                    : fromFx(quote),
                ),
        }
      })
    }),
    Effect.catch((first) =>
      fromFxtwitter.pipe(
        Effect.map(({ answer, post: { tweet } }) => ({
          source: 'fxtwitter',
          answer,
          read: fromFx(tweet, tweet.quote?.id),
          quoted:
            tweet.quote === undefined || tweet.quote === null ? undefined : fromFx(tweet.quote),
        })),
        Effect.mapError(
          (second) =>
            new Refused({
              message: `The post could not be copied: ${first.message.replace(/\.$/, '')}; ${second.message.replace(/\.$/, '')}.`,
            }),
        ),
      ),
    ),
  )
  const copy = {
    ...(yield* copyOfRead(read.read)),
    quoted: read.quoted === undefined ? null : yield* copyOfRead(read.quoted),
  }
  return { source: read.source, answer: read.answer, copy }
})

const { inbox, inboxPosts } = tables

const waiting = rowsOf(Schema.Struct({ position: Schema.Number, url: Schema.String }))

/**
 * Copies the posts of an item that wait for their copy, one after another: each is kept, or
 * noted with why it could not be. A post another copy has kept meanwhile is left as it is.
 */
export const keepPosts = Effect.fn('keepPosts')(function* (itemId: string) {
  const db = yield* drizzle
  const posts = yield* waiting(
    db
      .select({ position: inboxPosts.position, url: inboxPosts.url })
      .from(inboxPosts)
      .where(and(eq(inboxPosts.item_id, itemId), eq(inboxPosts.status, 'pending')))
      .orderBy(asc(inboxPosts.position)),
  )
  yield* Effect.forEach(
    posts,
    ({ position, url }) =>
      Effect.match(copyOf(url), {
        onFailure: ({ message }) => ({ status: 'failed', reason: message }),
        onSuccess: (kept) => ({ status: 'kept', ...kept }),
      }).pipe(
        Effect.flatMap((outcome) =>
          db
            .update(inboxPosts)
            .set({ ...outcome, copied_at: sql`now()` })
            .where(
              and(
                eq(inboxPosts.item_id, itemId),
                eq(inboxPosts.position, position),
                eq(inboxPosts.status, 'pending'),
              ),
            ),
        ),
      ),
    { discard: true },
  )
})

/**
 * Copies the posts of an item within `COPY_TIME`, never failing: what is not copied by then waits,
 * and the next take copies it.
 */
export const keepPostsNow = (itemId: string) =>
  keepPosts(itemId).pipe(Effect.timeout(COPY_TIME), Effect.ignore)

/**
 * Copies the posts of an item in a fiber of its own, so that the add answers at once. A server
 * that stops before the copy is made leaves the posts waiting: the take of the item copies them.
 */
export const keepPostsLater = (itemId: string) =>
  Effect.asVoid(Effect.forkDetach(keepPostsNow(itemId)))

const Post = Schema.Struct({
  url: Schema.String,
  status: Schema.Literals(['pending', 'kept', 'failed']),
  source: Schema.NullOr(Schema.Literals(['syndication', 'fxtwitter', 'syndication+fxtwitter'])),
  copy: Schema.NullOr(PostCopy),
  reason: Schema.NullOr(Schema.String),
})

const postRows = rowsOf(Post)

/** The posts of an item, in the order its text names them, with their copy or why it failed. */
export const postsOf = Effect.fn('postsOf')(function* (itemId: string) {
  const db = yield* drizzle
  return yield* postRows(
    db
      .select({
        url: inboxPosts.url,
        status: inboxPosts.status,
        source: inboxPosts.source,
        copy: inboxPosts.copy,
        reason: inboxPosts.reason,
      })
      .from(inboxPosts)
      .where(eq(inboxPosts.item_id, itemId))
      .orderBy(asc(inboxPosts.position)),
  )
})

const mimes = rowsOf(Schema.Struct({ mime: Schema.String }))

/**
 * The type of an image kept by that hash from a post of an item `of` selects, if one is: in the
 * post or the post it quotes.
 */
export const keptImageOf = Effect.fn('keptImageOf')(function* (hash: string, of: SQL) {
  const db = yield* drizzle
  const kept = (path: string) =>
    sql`jsonb_path_query_first(${inboxPosts.copy}, ${path}::jsonpath,
      jsonb_build_object('hash', ${hash}::text)) #>> '{}'`
  const mime = kept('$.images[*] ? (@.sha256 == $hash).mime')
  const quoted = kept('$.quoted.images[*] ? (@.sha256 == $hash).mime')
  const [found] = yield* mimes(
    db
      .select({ mime: sql<string>`coalesce(${mime}, ${quoted})` })
      .from(inboxPosts)
      .innerJoin(inbox, eq(inbox.id, inboxPosts.item_id))
      .where(and(of, sql`coalesce(${mime}, ${quoted}) IS NOT NULL`))
      .limit(1),
  )
  return found?.mime
})
