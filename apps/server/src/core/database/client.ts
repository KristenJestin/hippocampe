import { PgClient } from '@effect/sql-pg'
import * as PgDrizzle from 'drizzle-orm/effect-postgres'
import { Config, Context, Duration, Effect, Layer, Predicate, Schedule, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { startupParameters } from '../search/near.ts'

export class DatabaseUrlMissing extends Schema.TaggedError<DatabaseUrlMissing>()(
  'DatabaseUrlMissing',
  {},
) {
  override readonly message =
    'The environment variable DATABASE_URL is missing: set it to the URL of the PostgreSQL database.'
}

/** The URL of the PostgreSQL server and database, from `DATABASE_URL`. */
export const databaseUrl = Config.Redacted('DATABASE_URL').pipe(
  Effect.mapError(() => new DatabaseUrlMissing()),
)

/** The database of `DATABASE_URL`, as the SQL client every operation of the core runs on. */
export const layer = Layer.unwrap(
  Effect.map(databaseUrl, (url) => PgClient.layer({ url, startupParameters })),
)

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
  const url = yield* databaseUrl
  return yield* Effect.flatMap(SqlClient.SqlClient, (sql) => sql`SELECT 1`).pipe(
    Effect.provide(PgClient.layer({ url, connectTimeout: '2 seconds' })),
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
