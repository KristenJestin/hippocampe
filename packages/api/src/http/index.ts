/**
 * Hippocampe's HTTP API, as its clients see it: the routes, what they take and return, and how a key
 * is sent. The server implements it; `HttpApiClient.make(HippocampeApi)` derives a typed client from
 * it, and the OpenAPI document is generated from it.
 */
import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi,
} from 'effect/http-api'
import {
  About,
  EntryRead,
  HistoryPage,
  InboxSend,
  InboxSent,
  InboxUploadFields,
  ListOptions,
  SearchOptions,
  SearchResult,
  TreeEntry,
  TypeDefinition,
} from '../model/index.ts'

/** A request without a key, or with a key Hippocampe does not accept. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  'Unauthorized',
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/** A key without the right a route needs. */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  'Forbidden',
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Nothing under that name. */
export class NotFound extends Schema.TaggedError<NotFound>()(
  'NotFound',
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

/** A request the rules of Hippocampe refuse, with one sentence per problem. */
export class Invalid extends Schema.TaggedError<Invalid>()(
  'Invalid',
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/**
 * Every route is reached with a key sent as `Authorization: Bearer <key>`: with the right `read`
 * to read, with the right `write` to add to the inbox.
 */
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  '@hippocampe/api/http/Authorization',
  {
    requiredForClient: true,
    security: { bearer: HttpApiSecurity.bearer },
    error: [Unauthorized, Forbidden],
  },
) {}

const about = HttpApiGroup.make('about')
  .add(HttpApiEndpoint.get('about', '/api/about', { success: About }))
  .annotateMerge(
    OpenApi.annotations({
      title: 'About',
      description: 'Which Hippocampe this is: production or development, its version and commit.',
    }),
  )

const types = HttpApiGroup.make('types')
  .add(
    HttpApiEndpoint.get('list', '/api/types', {
      success: Schema.Struct({ types: Schema.Array(TypeDefinition) }).annotate({
        identifier: 'TypeList',
      }),
    }),
  )
  .annotateMerge(OpenApi.annotations({ title: 'Types', description: 'The types of entry.' }))

const entries = HttpApiGroup.make('entries')
  .add(
    HttpApiEndpoint.get('list', '/api/entries', {
      query: ListOptions.fields,
      success: Schema.Struct({
        entries: Schema.Array(TreeEntry),
        /** With a filter, where the next page starts (`null` at the end); the tree has none. */
        next_cursor: Schema.optionalKey(Schema.NullOr(Schema.String)),
      }).annotate({ identifier: 'EntryList' }),
      error: Invalid,
    }),
  )
  .add(
    HttpApiEndpoint.get('pending', '/api/pending-references', {
      success: Schema.Struct({
        pending: Schema.Array(
          Schema.Struct({
            slug: Schema.String,
            cited_by: Schema.Array(
              Schema.Struct({ id: Schema.String, slug: Schema.String, title: Schema.String }),
            ),
          }).annotate({ identifier: 'PendingReference' }),
        ),
      }).annotate({ identifier: 'PendingReferences' }),
    }),
  )
  .add(
    HttpApiEndpoint.get('history', '/api/entries/:entry/history', {
      params: { entry: Schema.String.annotate({ description: 'The slug or id of an entry.' }) },
      query: {
        limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
        cursor: Schema.optionalKey(Schema.String),
        event: Schema.optionalKey(
          Schema.String.annotate({ description: 'One event, by its id, with its values whole.' }),
        ),
      },
      success: HistoryPage,
      error: [NotFound, Invalid],
    }),
  )
  .add(
    HttpApiEndpoint.get('read', '/api/entries/:entry', {
      params: { entry: Schema.String.annotate({ description: 'The slug or id of an entry.' }) },
      success: EntryRead,
      error: NotFound,
    }),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: 'Entries',
      description:
        'The tree of entries, or the entries a filter keeps; an entry with its place in it, its children and its links; and its history.',
    }),
  )

const search = HttpApiGroup.make('search')
  .add(
    HttpApiEndpoint.get('search', '/api/search', {
      query: {
        q: Schema.String.annotate({
          description:
            'A sentence or a few words, 600 characters at most: the entries that hold any of its significant words, the rarest and the heaviest first, each with its `score`. A word no entry holds, such as a misspelled name, finds the entries named close to it. A quoted phrase or a word excluded with a minus requires every word.',
        }),
        ...SearchOptions.fields,
      },
      success: Schema.Struct({
        results: Schema.Array(SearchResult),
        total: Schema.Int.annotate({
          description:
            'How many entries the search finds in all, the filters applied, whatever the `limit`.',
        }),
      }).annotate({
        identifier: 'SearchResults',
      }),
      error: Invalid,
    }),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: 'Search',
      description: 'Full-text search: titles, aliases, tags and summaries first, then bodies.',
    }),
  )

const inbox = HttpApiGroup.make('inbox')
  .add(
    HttpApiEndpoint.post('add', '/api/inbox', {
      payload: [
        InboxSend,
        Schema.Struct({
          file: Multipart.SingleFileSchema.annotate({ description: 'The file, 20 MB at most.' }),
          ...InboxUploadFields,
        })
          .pipe(HttpApiSchema.asMultipart())
          .annotate({ identifier: 'InboxUpload' }),
      ],
      success: InboxSent,
      error: Invalid,
    }),
  )
  .add(
    HttpApiEndpoint.get('follow', '/api/inbox', {
      query: {
        origin: Schema.optionalKey(Schema.String.annotate({ description: 'This origin exactly.' })),
        client_id: Schema.optionalKey(
          Schema.Array(Schema.String).annotate({
            description: 'The items sent with these identifiers.',
          }),
        ),
        limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
        cursor: Schema.optionalKey(Schema.String),
      },
      success: Schema.Struct({
        items: Schema.Array(InboxSent),
        next_cursor: Schema.NullOr(Schema.String),
      }).annotate({ identifier: 'InboxSentPage' }),
      error: Invalid,
    }),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: 'Inbox',
      description:
        'Puts a text, a link or a file into the inbox, for an agent to turn into entries, and follows what became of each item, newest first.',
    }),
  )

/** The API of Hippocampe: it reads, and adds to the inbox. Every other write goes through MCP. */
export class HippocampeApi extends HttpApi.make('hippocampe')
  .add(about)
  .add(types)
  .add(entries)
  .add(search)
  .add(inbox)
  .middleware(Authorization)
  .annotateMerge(
    OpenApi.annotations({
      title: 'Hippocampe',
      version: '0.0.0',
      description:
        'The API of Hippocampe is experimental: only its own clients use it, it still moves, and changing it is never a breaking change.',
    }),
  ) {}
