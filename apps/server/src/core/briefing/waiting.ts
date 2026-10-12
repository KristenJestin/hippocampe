import { Effect } from 'effect'
import { countSupposed, supposedValues } from '../entries/index.ts'
import { pendingReferences } from '../links/index.ts'

/** How many of what waits a briefing names: the rest is a `count` away, in `search` or `read`. */
export const FIRST = 5

/**
 * What waits for someone, counted and its first few: the values and links still supposed or
 * ambiguous (with their entry, who wrote them and when), and the references without an entry.
 */
export const waitingOn = Effect.gen(function* () {
  // Counted apart, and only the first few are read with their writer and their time.
  const count = yield* countSupposed({})
  const first = yield* supposedValues({ limit: FIRST })
  const references = yield* pendingReferences
  return {
    supposed: {
      count,
      first: first.map(({ slug, title, what, provenance, by, when }) => ({
        slug,
        title,
        what,
        provenance,
        by,
        when,
      })),
    },
    pending_references: { count: references.length, first: references.slice(0, FIRST) },
  }
})
