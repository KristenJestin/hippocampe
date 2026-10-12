import { count, eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { drizzle } from '../database/client.ts'
import { inbox } from '../database/schema.ts'

/** How many items wait in the inbox for an agent to take them. */
export const countPending = Effect.gen(function* () {
  const db = yield* drizzle
  const [row] = yield* db.select({ count: count() }).from(inbox).where(eq(inbox.status, 'pending'))
  return row?.count ?? 0
})
