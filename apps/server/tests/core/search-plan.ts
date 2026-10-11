import { Effect } from 'effect'
import { SqlClient, Statement } from 'effect/sql'

/**
 * The plan PostgreSQL gives the query of a search, as the lines `EXPLAIN (VERBOSE)` prints. The
 * search runs once, to be given the statement it sends; the load of the machine does not change
 * a plan.
 */
export const planOfSearch = <A, E, R>(searching: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const sent: Array<ReturnType<Statement.Statement<never>['compile']>> = []
    yield* searching.pipe(
      Effect.provideService(Statement.CurrentTransformer, (statement) =>
        Effect.sync(() => {
          sent.push(statement.compile())
          return statement
        }),
      ),
    )
    // The one that ranks the entries found: a search sends others, for their paths and the like.
    const ranking = sent.find(([text]) => text.includes('ts_rank'))
    if (ranking === undefined) return yield* Effect.die('the search sent no statement that ranks')
    const rows = yield* sql.unsafe<{ 'QUERY PLAN': string }>(
      `EXPLAIN (VERBOSE, COSTS OFF) ${ranking[0]}`,
      ranking[1],
    )
    return rows.map((row) => row['QUERY PLAN'])
  })

/**
 * Whether the plan computes the words of each entry found in a node of its own, to read them from
 * there for every word of the query, rather than in each place that uses them.
 */
export const computesWordsOnce = (plan: ReadonlyArray<string>) =>
  plan.some((line) => /^\s*Output: \(\(e\.search \|\| setweight\(jsonb_to_tsvector\(/.test(line))
