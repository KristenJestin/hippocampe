import {
  Authorization,
  Forbidden,
  HippocampeApi,
  Invalid,
  NotFound,
  Unauthorized,
} from '@hippocampe/api/http'
import { FIRST, waitingOn } from './core/briefing/index.ts'
import { Auth, Rights } from './core/auth/index.ts'
import { filterEntries, listEntries, readEntry } from './core/entries/index.ts'
import { cursorRefusal, historyPage } from './core/events/index.ts'
import { countPending, followInbox, listInbox, sendToInbox } from './core/inbox/index.ts'
import { Instance } from './core/instance.ts'
import { pendingReferences } from './core/links/index.ts'
import { Refused } from './core/refused.ts'
import { searchWithTotal } from './core/search/index.ts'
import { briefing, headsUpDue } from './core/time/index.ts'
import type { Occurrence } from './core/time/index.ts'
import { listTypes } from './core/types/index.ts'
import { Effect, FileSystem, Layer, Redacted } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

/** The sentence a key without the right `read` is refused with, over HTTP as over MCP. */
export const MAY_NOT_READ =
  'This key may not read: ask the owner of Hippocampe for a key with the right `read`.'

/** The sentence a key without the right `write` is refused with when it adds to the inbox. */
export const MAY_NOT_WRITE =
  'This key may not write: ask the owner of Hippocampe for a key with the right `write`.'

/**
 * The key of a request, verified by Better Auth: it must hold the right `read` to read, and the
 * right `write` to add to the inbox.
 */
const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* Auth
    return Authorization.of({
      bearer: (route, { credential, endpoint }) =>
        Effect.gen(function* () {
          const secret = Redacted.value(credential)
          const { rights } = yield* auth
            .verifyKey(secret === '' ? undefined : secret)
            .pipe(Effect.mapError(({ message }) => new Unauthorized({ message })))
          if (endpoint.method === 'GET' ? !rights.includes('read') : !rights.includes('write'))
            return yield* new Forbidden({
              message: endpoint.method === 'GET' ? MAY_NOT_READ : MAY_NOT_WRITE,
            })
          return yield* Effect.provideService(route, Rights, rights)
        }),
    })
  }),
)

const about = HttpApiBuilder.group(HippocampeApi, 'about', (handlers) =>
  Effect.gen(function* () {
    const { name, label, version, commit } = yield* Instance
    return handlers.handle('about', () =>
      Effect.succeed({ instance: name, label, version, commit }),
    )
  }),
)

const types = HttpApiBuilder.group(HippocampeApi, 'types', (handlers) =>
  Effect.succeed(
    handlers.handle('list', () =>
      listTypes.pipe(
        Effect.map((defined) => ({ types: defined })),
        Effect.orDie,
      ),
    ),
  ),
)

const entries = HttpApiBuilder.group(HippocampeApi, 'entries', (handlers) =>
  Effect.succeed(
    handlers
      .handle('list', ({ query }) =>
        Effect.gen(function* () {
          // Without a filter, the whole tree, as it always was.
          if (Object.keys(query).length === 0) return { entries: yield* listEntries() }
          return yield* filterEntries({ ...query, tags: query.tag })
        }).pipe(
          Effect.catch((error) =>
            error instanceof Refused
              ? Effect.fail(new Invalid({ message: error.message }))
              : Effect.die(error),
          ),
        ),
      )
      .handle('history', ({ params, query }) => {
        // A cursor that is not one is the request's mistake: 400, not 404.
        const refusal = cursorRefusal(query.cursor)
        if (refusal !== undefined) return Effect.fail(new Invalid({ message: refusal }))
        return historyPage(params.entry, query).pipe(
          Effect.catch((error) =>
            error instanceof Refused
              ? Effect.fail(new NotFound({ message: error.message }))
              : Effect.die(error),
          ),
        )
      })
      .handle('pending', () =>
        pendingReferences.pipe(
          Effect.map((pending) => ({ pending })),
          Effect.orDie,
        ),
      )
      .handle('read', ({ params }) =>
        readEntry(params.entry).pipe(
          Effect.catch((error) =>
            error instanceof Refused
              ? Effect.fail(new NotFound({ message: error.message }))
              : Effect.die(error),
          ),
        ),
      ),
  ),
)

/** An occurrence with its identity: the entry, the field and the date, the same each time. */
const identified = (each: Occurrence) => ({
  id: `${each.entry.id}:${each.field}:${each.date}`,
  ...each,
})

const briefed = HttpApiBuilder.group(HippocampeApi, 'briefing', (handlers) =>
  Effect.succeed(
    handlers.handle('briefing', ({ query }) =>
      Effect.gen(function* () {
        // The computation of the `briefing` tool; reading the heads-ups here tells no one.
        const { from, to, upcoming, overdue } = yield* briefing(query.period ?? 'today')
        const { items } = yield* listInbox({ status: 'pending', limit: FIRST })
        return {
          from,
          to,
          upcoming: upcoming.map(identified),
          overdue: overdue.map(identified),
          heads_up: (yield* headsUpDue).map(identified),
          waiting: {
            inbox: {
              count: yield* countPending,
              first: items.map(({ id, name, origin, size, status }) => ({
                id,
                name,
                origin,
                size,
                status,
              })),
            },
            ...(yield* waitingOn),
          },
        }
      }).pipe(Effect.orDie),
    ),
  ),
)

const searching = HttpApiBuilder.group(HippocampeApi, 'search', (handlers) =>
  Effect.succeed(
    handlers.handle('search', ({ query: { q, ...options } }) =>
      searchWithTotal(q, options).pipe(
        Effect.catch((error) =>
          error instanceof Refused
            ? Effect.fail(new Invalid({ message: error.message }))
            : Effect.die(error),
        ),
      ),
    ),
  ),
)

/** A refusal of the rules of Hippocampe is the request's mistake: 400 with its sentence. */
const invalid = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catch((error) =>
      error instanceof Refused
        ? Effect.fail(new Invalid({ message: error.message }))
        : Effect.die(error),
    ),
  )

const inbox = HttpApiBuilder.group(HippocampeApi, 'inbox', (handlers) =>
  Effect.succeed(
    handlers
      .handle('add', ({ payload }) =>
        invalid(
          Effect.gen(function* () {
            if (!('file' in payload)) {
              const { client_id, ...item } = payload
              return yield* sendToInbox(item, client_id)
            }
            const { file, client_id, name, ...given } = payload
            // A file comes as itself, not as base64; the inbox keeps it under the same rules.
            const bytes = yield* (yield* FileSystem.FileSystem).readFile(file.path)
            return yield* sendToInbox(
              {
                kind: 'file',
                name: name ?? file.name,
                data: Buffer.from(bytes).toString('base64'),
                ...given,
              },
              client_id,
            )
          }),
        ),
      )
      .handle('follow', ({ query }) => invalid(followInbox(query))),
  ),
)

/**
 * The read API, its OpenAPI document at `/api/openapi.json`, behind the keys of Better Auth. It
 * runs on the database and the authentication the server provides once.
 */
export const ApiRoutes = HttpApiBuilder.layer(HippocampeApi, {
  openapiPath: '/api/openapi.json',
}).pipe(
  Layer.provide([about, types, entries, briefed, searching, inbox]),
  Layer.provide(AuthorizationLayer),
)
