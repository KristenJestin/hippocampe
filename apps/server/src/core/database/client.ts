import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Schedule,
  Schema,
} from 'effect'
import { SqlClient } from 'effect/sql'
import { startupParameters } from '../search/near.ts'
import { embeddedSocket, socketOf } from './embedded.ts'

export class DatabaseUrlMissing extends Schema.TaggedError<DatabaseUrlMissing>()(
  'DatabaseUrlMissing',
  {},
) {
  override readonly message =
    'The environment variable DATABASE_URL is missing: set it to the URL of the PostgreSQL database, or set HIPPOCAMPE_DATABASE_DIR to a folder for the embedded database.'
}

export class DatabaseTwice extends Schema.TaggedError<DatabaseTwice>()('DatabaseTwice', {}) {
  override readonly message =
    'Both DATABASE_URL and HIPPOCAMPE_DATABASE_DIR are set: keep DATABASE_URL for a PostgreSQL server, or HIPPOCAMPE_DATABASE_DIR for the embedded database, not both.'
}

/** The URL of the PostgreSQL server and database, from `DATABASE_URL`. */
export const databaseUrl = Config.Redacted('DATABASE_URL').pipe(
  Effect.mapError(() => new DatabaseUrlMissing()),
)

/** The folder of the embedded database, from `HIPPOCAMPE_DATABASE_DIR`, if it is set. */
const embeddedFolder = Effect.gen(function* () {
  const folder = yield* Config.option(Config.String('HIPPOCAMPE_DATABASE_DIR')).pipe(Effect.orDie)
  if (Option.isNone(folder)) return folder
  const url = yield* Config.option(Config.String('DATABASE_URL')).pipe(Effect.orDie)
  return Option.isSome(url) ? yield* new DatabaseTwice() : folder
})

/** How a client reaches the embedded database: its socket, as PGlite's own user and database. */
export const embedded = (path: string) => ({
  path,
  username: 'postgres',
  database: 'postgres',
  prepare: false,
})

/** The database of the environment, held by this process when `own` says it must be. */
const clientOf = (own: boolean) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const folder = yield* embeddedFolder
      if (Option.isNone(folder))
        return PgClient.layer({ url: yield* databaseUrl, startupParameters })
      const path = yield* embeddedSocket(folder.value, { own, wait: 15_000 })
      return PgClient.layer({ ...embedded(path), maxConnections: 1, startupParameters })
    }),
  )

/**
 * The database as the SQL client every operation of the core runs on: the PostgreSQL server of
 * `DATABASE_URL`, or the embedded database of `HIPPOCAMPE_DATABASE_DIR` (see `embedded.ts`),
 * reached through the process that holds it, or held by this one when none does. Embedded, the
 * pool has one connection, so the transactions of a process run one after the other, and its
 * statements are left unprepared, since the session is shared.
 */
export const layer = clientOf(false)

/**
 * The database of the server: as `layer`, but an embedded database is always held by the server
 * itself, never reached through a command that will end; it waits while a command holds it.
 */
export const serverLayer = clientOf(true)

/**
 * The services of the database alone, out of a larger context: what a program built apart, such
 * as one MCP server per key, needs to run on the same pool.
 */
export const databaseServices = Effect.map(
  Effect.context<PgClient.PgClient | SqlClient.SqlClient>(),
  Context.pick(PgClient.PgClient, SqlClient.SqlClient),
)

/**
 * Whether the database of `DATABASE_URL` answers within two seconds, through a connection of its
 * own: a health check sees a database that came back without waiting for a pool to notice.
 */
export const databaseReachable = Effect.gen(function* () {
  const folder = yield* embeddedFolder
  const connection = Option.isSome(folder)
    ? embedded(socketOf(folder.value))
    : { url: yield* databaseUrl }
  return yield* Effect.flatMap(SqlClient.SqlClient, (sql) => sql`SELECT 1`).pipe(
    Effect.provide(PgClient.layer({ ...connection, connectTimeout: '2 seconds' })),
    Effect.timeout('2 seconds'),
  )
}).pipe(
  Effect.as(true),
  Effect.catchCause(() => Effect.succeed(false)),
)

/**
 * Drizzle on the pool of the core. Its queries go through the same client as Effect SQL, so they
 * run in the transaction of the fiber when there is one.
 */
export const drizzle = PgDrizzle.makeWithDefaults()

export class DatabaseNotReady extends Schema.TaggedError<DatabaseNotReady>()('DatabaseNotReady', {
  waited: Schema.String,
}) {
  override get message() {
    return `The database did not accept a connection within ${this.waited}: is PostgreSQL running, and is DATABASE_URL its address?`
  }
}

/**
 * Waits until the database accepts a connection: a PostgreSQL started a moment ago, such as the
 * one `hippo service install` runs beside the server, refuses connections while it starts up.
 * Tries again every half second for `wait`, then gives up in a sentence. What a connection
 * cannot fix by waiting, such as a wrong password, is refused at once.
 */
export const awaitDatabase = (wait: Duration.Input = '15 seconds') =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql`SELECT 1`).pipe(
    Effect.asVoid,
    Effect.retry({
      schedule: Schedule.spaced('500 millis'),
      while: (error) => !Predicate.isTagged(error.reason, 'AuthenticationError'),
    }),
    Effect.timeoutOrElse({
      duration: wait,
      orElse: () =>
        Effect.fail(
          new DatabaseNotReady({ waited: Duration.format(Duration.fromInputUnsafe(wait)) }),
        ),
    }),
  )
