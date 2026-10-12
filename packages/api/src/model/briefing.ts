import { Schema } from 'effect'

/** The days a briefing covers. */
export const BRIEFING_PERIODS = ['today', 'week', 'weekend'] as const

/**
 * One time a date comes back: the entry, the field, the date. Its `id` names it for good (the
 * entry, the field and the date), so a client can tell it was already warned of it.
 */
export const BriefingOccurrence = Schema.Struct({
  id: Schema.String.annotate({
    description: 'The same each time the occurrence is read: `<entry id>:<field>:<date>`.',
  }),
  entry: Schema.Struct({
    id: Schema.String,
    slug: Schema.String,
    title: Schema.String,
    type: Schema.String,
  }),
  field: Schema.String,
  date: Schema.String,
  period: Schema.String,
  days_left: Schema.NullOr(Schema.Int),
  age: Schema.NullOr(Schema.Int),
  deadline: Schema.Boolean,
}).annotate({ identifier: 'BriefingOccurrence' })

/** A reference to an entry that is not written yet, with the entries that cite it. */
export const PendingReference = Schema.Struct({
  slug: Schema.String,
  cited_by: Schema.Array(
    Schema.Struct({ id: Schema.String, slug: Schema.String, title: Schema.String }),
  ),
}).annotate({ identifier: 'PendingReference' })

/** How many wait, and the first few. */
const waits = <A extends Schema.Top>(first: A) =>
  Schema.Struct({ count: Schema.Int, first: Schema.Array(first) })

/** What a client shows the owner of what is coming and what waits, as `briefing` tells agents. */
export const Briefing = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  upcoming: Schema.Array(BriefingOccurrence).annotate({
    description: 'The occurrences in the period that no entry fulfills yet, by date.',
  }),
  overdue: Schema.Array(BriefingOccurrence).annotate({
    description: 'The deadlines past and not fulfilled.',
  }),
  heads_up: Schema.Array(BriefingOccurrence).annotate({
    description:
      'The occurrences inside their notice period today, whatever the period asked. Reading them tells no one: the same occurrence is given each day until it is fulfilled or past.',
  }),
  waiting: Schema.Struct({
    inbox: waits(
      Schema.Struct({
        id: Schema.String,
        name: Schema.NullOr(Schema.String),
        origin: Schema.String,
        size: Schema.NullOr(Schema.Int),
        status: Schema.Literals(['pending', 'taken', 'processed', 'dismissed']),
      }),
    ).annotate({ description: 'The items pending in the inbox, oldest first.' }),
    supposed: waits(
      Schema.Struct({
        slug: Schema.String,
        title: Schema.String,
        what: Schema.String,
        provenance: Schema.String.annotate({ description: '`inferred` or `ambiguous`.' }),
        by: Schema.NullOr(Schema.String),
        when: Schema.NullOr(Schema.String),
      }),
    ).annotate({ description: 'The values and links still supposed, the latest changes first.' }),
    pending_references: waits(PendingReference).annotate({
      description: 'The `[[references]]` still waiting for their entry.',
    }),
  }),
}).annotate({ identifier: 'Briefing' })
