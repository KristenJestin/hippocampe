/**
 * The key that last wrote an entry `e`, as a SQL expression over the events: the actor of the
 * latest event that moved the entry's `updated` (created, updated, archived, or its body rewritten
 * by a rename), so that `by` always goes with `updated`. A link, a medium or a reference that
 * resolved by itself when its entry came leaves `updated` where it was, and takes nothing over.
 * One definition, for `search` (its `by`, and the `by` filter) and the working memory of a session.
 */
export const LAST_WRITER = `(SELECT actor FROM events WHERE entry_id = e.id
  AND action IN ('create', 'update', 'rewrite', 'archive')
  ORDER BY id DESC LIMIT 1)`

/**
 * When the entry `e` last changed, as the text every reader gives: UTC, to the microsecond (the
 * precision the database keeps, so that a listing can resume from it).
 */
export const UPDATED_TEXT = `to_char(e.updated AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
