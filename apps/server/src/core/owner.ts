import { eq, sql } from 'drizzle-orm'
import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import { Rights } from './auth/rights.ts'
import { drizzle } from './database/client.ts'
import { rowsOf } from './database/rows.ts'
import { entries, instanceOwner } from './database/schema.ts'
import { lockedEntry, ownerEntryId, visibleOf } from './entries/operations.ts'
import { currentActor } from './events/actor.ts'
import { recordEvent } from './events/record.ts'
import { Refused } from './refused.ts'
import { sensitivity } from './sensitive.ts'

const owners = rowsOf(
  Schema.Struct({ slug: Schema.String, title: Schema.String, type: Schema.String }),
)

/**
 * The entry that stands for the owner, by its slug and title, or none: none, too, for a caller who
 * may not see it, who learns nothing of it.
 */
export const ownerEntry = Effect.gen(function* () {
  const db = yield* drizzle
  const [row] = yield* owners(
    db
      .select({ slug: entries.slug, title: entries.title, type: entries.type })
      .from(instanceOwner)
      .innerJoin(entries, eq(entries.id, instanceOwner.entry_id)),
  )
  if (row === undefined || (yield* sensitivity).hidesType(row.type)) return null
  return { slug: row.slug, title: row.title }
})

/**
 * Names the entry that stands for the owner, or none (`null`). The owner alone names it: what
 * they said is then cited as said by it. Recorded in the event log, on the entry it becomes and on
 * the one it was.
 */
export const setOwnerEntry = Effect.fn('setOwnerEntry')(function* (reference: string | null) {
  if (!(yield* Rights).includes('owner'))
    return yield* new Refused({
      message:
        'Only the owner names the entry that stands for them, from the command line (`owner:entry`).',
    })
  const client = yield* SqlClient.SqlClient
  const actor = yield* currentActor
  return yield* client.withTransaction(
    Effect.gen(function* () {
      const db = yield* drizzle
      let named: string | null = null
      if (reference !== null) {
        if ((yield* visibleOf(reference)) === undefined)
          return yield* new Refused({
            message: `The entry \`${reference}\` does not exist: name the entry that stands for you, by its slug or id.`,
          })
        const entry = yield* lockedEntry(reference)
        if (entry.archived_at !== null)
          return yield* new Refused({
            message: `The entry \`${reference}\` is archived: name an entry that is not.`,
          })
        named = entry.id
      }
      const before = yield* ownerEntryId
      if (before === named) return
      if (named === null) yield* db.delete(instanceOwner)
      else
        yield* db
          .insert(instanceOwner)
          .values({ entry_id: named })
          .onConflictDoUpdate({
            target: instanceOwner.id,
            set: { entry_id: named, updated: sql`now()` },
          })
      if (before !== null)
        yield* recordEvent(actor, { entryId: before, typeName: null }, 'owner', [
          { field: 'owner', before: true, after: false },
        ])
      if (named !== null)
        yield* recordEvent(actor, { entryId: named, typeName: null }, 'owner', [
          { field: 'owner', before: false, after: true },
        ])
    }),
  )
})
