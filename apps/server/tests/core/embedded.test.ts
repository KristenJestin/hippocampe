import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PgClient } from '@effect/sql-pg'
import { Deferred, Effect, Fiber, Layer, Schema, type Scope } from 'effect'
import { SqlClient } from 'effect/sql'
import { afterAll, describe, expect, test } from 'vitest'
import { embedded } from '../../src/core/database/client.ts'
import { embeddedSocket } from '../../src/core/database/embedded.ts'
import { latestVersion, migrate, schemaVersion } from '../../src/core/database/index.ts'
import { rowsOf } from '../../src/core/database/rows.ts'

/*
 * The embedded database itself, whatever database the rest of the suite runs on: each test opens
 * a folder of its own.
 */

const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-pglite-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let folders = 0
const freshFolder = () => {
  folders += 1
  return join(scratch, `pglite-${folders}`)
}

/** A client of the database in `folder`, as the command line is one: through its socket. */
const client = (path: string) => PgClient.layer({ ...embedded(path), maxConnections: 1 })

const counted = rowsOf(Schema.Struct({ count: Schema.Number }))
const count = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  counted(sql`SELECT count(*)::int AS count FROM said`),
).pipe(Effect.map(([row]) => row?.count))

/** Runs an effect while this process holds the folder. */
const holding = <A, E>(
  folder: string,
  effect: (path: string) => Effect.Effect<A, E, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.flatMap(embeddedSocket(folder, { own: true, wait: 0 }), (path) => effect(path)),
    ),
  )

describe('the embedded database', () => {
  test('the migrations bring an empty embedded database to the latest version', async () => {
    const version = await holding(freshFolder(), (path) =>
      Effect.andThen(migrate, schemaVersion).pipe(Effect.provide(client(path))),
    )
    expect(version).toBe(latestVersion)
  })

  test('a transaction holds the session: another connection waits until it ends', async () => {
    const seen = await holding(freshFolder(), (path) =>
      Effect.gen(function* () {
        const one = yield* Layer.build(client(path))
        const two = yield* Layer.build(client(path))
        yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`CREATE TABLE said (word text)`,
        ).pipe(Effect.provideContext(one))
        const begun = yield* Deferred.make<void>()
        const commit = yield* Deferred.make<void>()
        const writer = yield* Effect.forkChild(
          Effect.flatMap(SqlClient.SqlClient, (sql) =>
            sql.withTransaction(
              sql`INSERT INTO said VALUES ('first')`.pipe(
                Effect.andThen(Deferred.succeed(begun, undefined)),
                Effect.andThen(Deferred.await(commit)),
                Effect.andThen(sql`INSERT INTO said VALUES ('second')`),
              ),
            ),
          ).pipe(Effect.provideContext(one)),
        )
        yield* Deferred.await(begun)
        const reader = yield* Effect.forkChild(count.pipe(Effect.provideContext(two)))
        yield* Effect.sleep('300 millis')
        // The reader waits for its turn, as on a lock: it has not run inside the transaction.
        const waited = reader.pollUnsafe() === undefined
        yield* Deferred.succeed(commit, undefined)
        yield* Fiber.join(writer)
        return { waited, read: yield* Fiber.join(reader) }
      }),
    )
    expect(seen).toEqual({ waited: true, read: 2 })
  })

  test('a connection gone in the middle of its transaction leaves nothing of it behind', async () => {
    const left = await holding(freshFolder(), (path) =>
      Effect.gen(function* () {
        const context = yield* Layer.build(client(path))
        yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`CREATE TABLE said (word text)`,
        ).pipe(Effect.provideContext(context))
        // A client that begins, writes, and is gone before it commits, as a command killed.
        yield* Effect.promise(
          () =>
            new Promise<void>((done) => {
              const socket = createConnection({ path })
              const startup = Buffer.from('\0\x03\0\0user\0postgres\0database\0postgres\0\0')
              const length = Buffer.alloc(4)
              length.writeInt32BE(startup.length + 4)
              const statement = Buffer.from("BEGIN; INSERT INTO said VALUES ('lost');\0")
              const query = Buffer.alloc(5)
              query.write('Q')
              query.writeInt32BE(statement.length + 4, 1)
              let answers = 0
              socket.on('data', (data) => {
                // The startup, then the statements, each answered up to its `ReadyForQuery`.
                answers += data.includes(0x5a) ? 1 : 0
                if (answers === 1) socket.write(Buffer.concat([query, statement]))
                if (answers === 2) socket.destroy()
              })
              socket.on('close', () => done())
              socket.write(Buffer.concat([length, startup]))
            }),
        )
        return yield* count.pipe(Effect.provideContext(context))
      }),
    )
    expect(left).toBe(0)
  })

  test('a folder left held by a process that ended is taken over', async () => {
    const folder = freshFolder()
    mkdirSync(folder, { recursive: true })
    const ended = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid
    writeFileSync(join(folder, 'hippocampe.pid'), String(ended))
    const version = await holding(folder, (path) =>
      Effect.andThen(migrate, schemaVersion).pipe(Effect.provide(client(path))),
    )
    expect(version).toBe(latestVersion)
  })
})
