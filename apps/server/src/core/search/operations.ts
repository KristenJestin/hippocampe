import { Effect, Schema } from 'effect'
import { SqlClient } from 'effect/sql'
import type { Fragment } from 'effect/sql/Statement'
import { rowsOf } from '../database/rows.ts'
import { NAMES, SEARCHABLE } from '../database/schema.ts'
import { holding, wantedOf } from '../entries/certainty.ts'
import { LAST_WRITER, UPDATED_TEXT } from '../entries/last-writer.ts'
import { datedOn } from '../entries/dated.ts'
import { findEntry, pathOf, slugOf } from '../entries/operations.ts'
import { supposedIn } from '../entries/supposed.ts'
import { isDate, isDateTime } from '../entries/values.ts'
import { subtreeOf } from '../links/places.ts'
import { Refused } from '../refused.ts'
import { sensitivity } from '../sensitive.ts'
import { searchConfiguration } from './language.ts'
import { SearchResult } from '@hippocampe/api/model'
import type { SearchOptions } from '@hippocampe/api/model'

/** A search result with when its entry last changed and the key that changed it. */
const Found = Schema.Struct({
  ...SearchResult.fields,
  updated: Schema.String,
  by: Schema.NullOr(Schema.String),
})
export type Found = typeof Found.Type

const found = rowsOf(
  Schema.Struct({
    ...Found.fields,
    path: Schema.Null,
    date: Schema.NullOr(Schema.String),
    score: Schema.NullOr(Schema.Number),
    total: Schema.Number,
    summary_provenance: Schema.NullOr(Schema.Literals(['inferred', 'ambiguous'])),
  }),
)

/**
 * How a search is ordered and bounded by the last change of the entries, beside `SearchOptions`.
 * The HTTP API does not take them.
 */
export const Recency = Schema.Struct({
  sort: Schema.optionalKey(Schema.Literals(['relevance', 'updated', 'dated'])).annotate({
    description:
      'The order: `relevance` (the default with a `query`), `updated`, the most recently changed first (the default without a `query`), or `dated`: only the entries that happened at a time (their type is dated, `dated_by`), the most recent date first; with `under`, what happened to a subject, further back than `read` gives.',
  }),
  since: Schema.optionalKey(Schema.String).annotate({
    description:
      'Only the entries last changed on or after this date, from the start of that day in UTC (`2026-10-05`), or this date and time (`2026-10-05T14:30:00Z`).',
  }),
  until: Schema.optionalKey(Schema.String).annotate({
    description:
      'Only the entries last changed on or before this date, to the end of that day in UTC (`2026-10-05`), or this date and time (`2026-10-05T14:30:00Z`).',
  }),
  by: Schema.optionalKey(Schema.String).annotate({
    description: 'Only the entries the key of this name changed last.',
  }),
})
export type Recency = typeof Recency.Type

/** The first and last instant of a day, or the instant given. */
const startOf = (moment: string | undefined) =>
  moment === undefined ? null : isDate(moment) ? `${moment}T00:00:00Z` : moment
const endOf = (moment: string | undefined) =>
  moment === undefined ? null : isDate(moment) ? `${moment}T23:59:59.999999Z` : moment

/** The longest `query`: a sentence, as a person says or writes it. */
const QUERY_LENGTH = 600

/** An operator of a web search: a quoted phrase, or a word excluded with a minus. */
const OPERATOR = /"|(?:^|\s)-\S/
/** What a query excludes with a minus, which its score does not look for. */
const EXCLUDED = /(?:^|\s)-(?:"[^"]*"?|\S+)/g

/** Marks the matched words in the excerpt with `<mark>`, which no Markdown body uses for itself. */
const HEADLINE = 'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=12, MaxFragments=2'

/**
 * Finds entries by their text: titles and aliases weigh most, then tags and summaries, then
 * bodies; a query made of the words of an entry's slug ranks it first, and so does a query that
 * says an entry's title, an alias or its slug whole, whose words then weigh as the rarest. A
 * sentence finds the entries that hold any of its significant words, those that hold more of
 * them, in heavier places, first, each with its `score`; a quoted phrase or a word excluded with a
 * minus requires every word. Archived entries are left out unless asked for; `under` keeps only the descendants
 * of an entry. Accents do not matter. Without a query, every entry the filters keep, the most
 * recently changed first, with no excerpt: it would say the summary again. Each result says when
 * its entry last changed and which key changed it. Beside the results, the `total` of entries the
 * filters keep (or the query finds), whatever the `limit`, counted by the same statement.
 */
export const searchWithTotal = Effect.fn('search')(function* (
  query: string | undefined,
  options: SearchOptions & Recency = {},
) {
  if (query === undefined && options.sort === 'relevance') {
    return yield* new Refused({
      message: 'Sorting by relevance needs a `query`: give one, or sort by `updated`.',
    })
  }
  const problems = (['since', 'until'] as const).flatMap((key) => {
    const value = options[key]
    return value === undefined || isDate(value) || isDateTime(value)
      ? []
      : [
          `The field \`${key}\` must be a date such as \`2026-10-05\` or a date and time such as \`2026-10-05T14:30:00Z\`.`,
        ]
  })
  if (problems.length > 0) return yield* new Refused({ message: problems.join(' ') })
  if (query !== undefined && query.length > QUERY_LENGTH) {
    return yield* new Refused({
      message: `A \`query\` is a sentence, ${QUERY_LENGTH} characters at most: this one has ${query.length}. Keep the words that matter.`,
    })
  }
  const sql = yield* SqlClient.SqlClient
  const configuration = yield* searchConfiguration
  const { hiddenTypes, hiddenFields } = yield* sensitivity
  const wanted = wantedOf(options)
  const certain = yield* holding(wanted, options.by)
  const under = options.under === undefined ? null : (yield* findEntry(options.under)).id
  // The types with fields the caller may not see: the index holds those fields, so their entries
  // are matched without it.
  const withHiddenFields = Object.entries(hiddenFields).flatMap(([type, fields]) =>
    fields.length > 0 ? [type] : [],
  )
  const ofTypesWithHiddenFields = (entry: 'e' | 'x') =>
    withHiddenFields.length === 0
      ? sql`false`
      : sql`${sql.literal(entry)}.type IN ${sql.in(withHiddenFields)}`
  // The words of an entry the caller may see: those of the index, but the fields they may not.
  const visibleWords = (entry: 'e' | 'x') => {
    const of = (column: string) => sql.literal(`${entry}.${column}`)
    return sql`${of('search')} || setweight(jsonb_to_tsvector(${configuration}::regconfig,
          ${of('fields')} - coalesce(ARRAY(SELECT jsonb_array_elements_text(
            ${JSON.stringify(hiddenFields)}::jsonb -> ${of('type')})), '{}'),
          '["string", "numeric"]'), 'C')
        -- Where the entry comes from: its URLs, external identifiers and their labels.
        || setweight(jsonb_to_tsvector(${configuration}::regconfig,
          jsonb_path_query_array(${of('sources')}, '$[*].url')
            || jsonb_path_query_array(${of('sources')}, '$[*].identifier')
            || jsonb_path_query_array(${of('sources')}, '$[*].label'), '["string"]'), 'C')`
  }
  const subtree = yield* subtreeOf(under)
  // The day the entry happened, when its type is dated and the caller may see it.
  const dated = yield* datedOn
  const byDate = options.sort === 'dated'
  // What the filters keep, whether there is a query or not.
  const filters = sql`
      AND (${!byDate} OR ${dated} IS NOT NULL)
      AND (${options.type ?? null}::text IS NULL OR e.type = ${options.type ?? null})
      AND e.tags @> ${JSON.stringify(options.tag ?? [])}::jsonb
      AND ${certain}
      AND (${options.archived ?? false} OR e.archived_at IS NULL)
      AND (${under}::uuid IS NULL OR e.id IN (SELECT id FROM subtree))
      AND (${startOf(options.since)}::timestamptz IS NULL
        OR e.updated >= ${startOf(options.since)}::timestamptz)
      AND (${endOf(options.until)}::timestamptz IS NULL
        OR e.updated <= ${endOf(options.until)}::timestamptz)
      -- Beside the supposed, the key is who wrote a supposed value, which \`holding\` checks.
      AND (${options.by ?? null}::text IS NULL OR ${wanted.length > 0}::boolean
        OR ${sql.literal(LAST_WRITER)} = ${options.by ?? null})`
  // When the entry last changed, and who changed it.
  const lastChange = sql`${sql.literal(UPDATED_TEXT)} AS updated,
      ${dated} AS date,
      ${sql.literal(LAST_WRITER)} AS by,
      CASE WHEN e.provenance ->> 'summary' IN ('inferred', 'ambiguous')
        THEN e.provenance ->> 'summary' END AS summary_provenance`
  const listing = sql`
    WITH RECURSIVE ${subtree}
    SELECT e.id::text AS id, e.slug, e.type, e.title, e.summary, NULL AS path,
      '' AS excerpt, 0::float8 AS rank, NULL::float8 AS score, ${lastChange},
      count(*) OVER ()::int AS total
    FROM entries e
    WHERE NOT (${JSON.stringify(hiddenTypes)}::jsonb ? e.type) ${filters}
    ORDER BY ${byDate ? sql`${dated} DESC, e.id DESC,` : sql``} e.updated DESC, e.title
    LIMIT ${options.limit ?? 20}`
  // With a query, the matches in order of relevance, or of last change when asked.
  const byChange = options.sort === 'updated'
  // A text as a slug spells it: lowercase, without accents, its words joined by hyphens.
  const slugged = (text: Fragment) =>
    sql`trim(both '-' from regexp_replace(unaccent(lower(${text})), '[^a-z0-9]+', '-', 'g'))`
  const matching = (text: string) => {
    const operators = OPERATOR.test(text)
    const said = operators ? text.replace(EXCLUDED, ' ') : text
    return sql`
    WITH RECURSIVE spoken AS (
      -- The significant words of the query, as the configuration keeps them (stop words left
      -- out, the others stemmed), quoted for a \`tsquery\`; a hyphenated word counts as its parts.
      -- Each is normalised whole by \`to_tsvector\`: \`ts_debug\` shows its first dictionary only.
      -- Beside it, the word as it was written, as a slug spells it, and whether it is made of
      -- letters only, as a name.
      SELECT '''' || replace(replace(lexeme, '\\', '\\\\'), '''', '''''') || '''' AS word,
        token.token AS said, ${slugged(sql`token.token`)} AS spelled,
        token.alias IN ('asciiword', 'word', 'hword_asciipart', 'hword_part') AS lettered
      FROM ts_debug(${configuration}::regconfig, ${said}) AS token,
        unnest(tsvector_to_array(to_tsvector(${configuration}::regconfig, token.token))) AS lexeme
      WHERE token.alias NOT IN ('hword', 'asciihword', 'numhword')
    ), words AS (
      SELECT coalesce(array_agg(DISTINCT word), '{}') AS quoted FROM spoken
    ), seen AS MATERIALIZED (
      SELECT count(*) AS entries FROM entries x
      WHERE NOT (${JSON.stringify(hiddenTypes)}::jsonb ? x.type)
    ), counted AS MATERIALIZED (
      -- How many of the entries the caller may see hold each word. One count per word, which the
      -- search index answers.
      SELECT word, seen.entries, holding
      FROM words, seen, unnest(words.quoted) AS word, LATERAL (
        SELECT count(*) AS holding FROM entries x
        WHERE ${sql.literal(SEARCHABLE)} @@ word::tsquery
          AND NOT (${JSON.stringify(hiddenTypes)}::jsonb ? x.type)
          AND (NOT ${ofTypesWithHiddenFields('x')} OR ${visibleWords('x')} @@ word::tsquery)
      ) AS holders
    ), near AS MATERIALIZED (
      -- A word of letters no entry holds, as a name heard or typed is often written otherwise:
      -- the entries named close to it, in their title, aliases or slug, by trigrams, and how
      -- close (\`NEAR\` at least, as the connection sets it); never their bodies. The names index
      -- answers. With an operator, every word is exact.
      SELECT x.id, counted.word, max(word_similarity(spoken.said, ${sql.literal(NAMES)})) AS closeness
      FROM counted JOIN spoken USING (word), entries x
      WHERE ${!operators} AND counted.holding = 0 AND spoken.lettered
        AND spoken.said <% (${sql.literal(NAMES)})
        AND NOT (${JSON.stringify(hiddenTypes)}::jsonb ? x.type)
      GROUP BY x.id, counted.word
    ), sentence AS MATERIALIZED (
      -- The query as a slug spells it, between hyphens (none when it has no such word), and its
      -- words, anywhere and in a title or aliases.
      SELECT '-' || nullif(${slugged(sql`${said}::text`)}, '') || '-' AS spelled,
        (SELECT string_agg(word, ' | ') FROM spoken)::tsquery AS anywhere,
        (SELECT string_agg(word || ':A', ' | ') FROM spoken)::tsquery AS titled
    ), called AS MATERIALIZED (
      -- The entries the query calls by their name: a run of its words is their slug, their title
      -- or an alias, as a slug spells them (case and accents aside). Such an entry holds the words
      -- of its name in its title or aliases: the search index finds the entries that hold any of
      -- the words, and their own \`search\` keeps those that hold one in a title or aliases. How
      -- much of the query the longest of these names covers, and their words.
      SELECT x.id, max(length(name.spelled))::float8 / (length(sentence.spelled) - 2) AS share,
        string_to_array(string_agg(name.spelled, '-'), '-') AS words
      FROM sentence, (
        SELECT x.id, x.slug, x.title, x.aliases FROM entries x
        WHERE ${sql.literal(SEARCHABLE)} @@ (SELECT anywhere FROM sentence)
          AND x.search @@ (SELECT titled FROM sentence)
          AND NOT (${JSON.stringify(hiddenTypes)}::jsonb ? x.type)
      ) AS x, LATERAL (
        SELECT x.slug AS spelled
        UNION ALL SELECT ${slugged(sql`name`)} FROM (SELECT x.title AS name
          UNION ALL SELECT jsonb_array_elements_text(x.aliases)) AS names
      ) AS name
      WHERE position('-' || name.spelled || '-' IN sentence.spelled) > 0
      GROUP BY x.id, sentence.spelled
    ), rarities AS MATERIALIZED (
      -- How rare each word is among the entries the caller may see, as BM25 counts it: a word
      -- most entries hold weighs almost nothing, a word none holds weighs most. A word found only
      -- near names counts the entries named close to it. A word of a name the query calls weighs
      -- as a word none holds, however many entries hold it: it is what the query is about.
      SELECT word, CASE WHEN word IN (SELECT word FROM spoken, called WHERE spelled = ANY(words))
        THEN ln(1 + (entries + 0.5) / 0.5)
        ELSE ln(1 + (entries - holding - named + 0.5) / (holding + named + 0.5)) END AS rarity
      FROM counted, LATERAL (
        SELECT count(*) AS named FROM near WHERE near.word = counted.word
      ) AS close
    ), query AS MATERIALIZED (
      -- With an operator, a web search, every word required; otherwise any of the words. Each
      -- word also as found in a title or aliases (\`A\`), in tags or a summary (\`B\`), or anywhere.
      SELECT ${
        operators
          ? sql`websearch_to_tsquery(${configuration}::regconfig, ${text})`
          : sql`nullif(array_to_string(words.quoted, ' | '), '')::tsquery`
      } AS q, each.*
      FROM words, LATERAL (
        -- One pass, so that the arrays keep the words in the same order.
        SELECT array_agg((word || ':A')::tsquery) AS titled,
          array_agg((word || ':B')::tsquery) AS summarised,
          array_agg(word::tsquery) AS anywhere, array_agg(rarity) AS rarity, sum(rarity) AS weight,
          ARRAY(SELECT id FROM near) AS near
        FROM rarities
      ) AS each
    ), ${subtree}
    , found AS (
      SELECT e.*, ${sql.literal(SEARCHABLE)} AS everything,
        -- The values of the fields, but those the caller may not see, weigh as much as a body.
        ${visibleWords('e')} AS words
      FROM entries e WHERE NOT (${JSON.stringify(hiddenTypes)}::jsonb ? e.type)
    )
    SELECT e.id::text AS id, e.slug, e.type, e.title, e.summary, NULL AS path,
      coalesce(ts_headline(${configuration}::regconfig,
        concat_ws(' — ', e.title, nullif(e.summary, ''), nullif(e.body, '')), query.q,
        ${HEADLINE}), e.summary) AS excerpt,
      ts_rank(held.words, query.q)::float8 AS rank,
      -- Each significant word counts by its rarity, times the heaviest place the entry holds it
      -- in, as \`ts_rank\` weighs them: 1 in the title and aliases, 0.4 in the tags and summary,
      -- 0.2 elsewhere; a word found near a name, its closeness to it. Over what all the words
      -- would count in a title.
      coalesce(((SELECT sum(rarity * CASE WHEN held.words @@ titled THEN 1
          WHEN held.words @@ summarised THEN 0.4 WHEN held.words @@ anywhere THEN 0.2 ELSE 0 END)
        FROM unnest(query.titled, query.summarised, query.anywhere, query.rarity)
          AS word(titled, summarised, anywhere, rarity))
        + coalesce((SELECT sum(rarity * closeness) FROM near JOIN rarities USING (word)
          WHERE near.id = e.id), 0)
      ) / nullif(query.weight, 0), 0)::float8 AS score, ${lastChange},
      -- A query that is the words of a slug, whole and in order, names that entry, and so does a
      -- query that calls an entry by its name: those come first, the closest slug first, then the
      -- name that covers more of the query.
      greatest(CASE WHEN ('-' || e.slug || '-') LIKE ${`%-${slugOf(text)}-%`}
        THEN ${slugOf(text).length}::float8 / length(e.slug) ELSE 0 END,
        coalesce((SELECT share FROM called WHERE called.id = e.id), 0)) AS fit,
      -- Before the \`LIMIT\`: every match the filters keep.
      count(*) OVER ()::int AS total
    -- The words of each entry found, computed once rather than at every use.
    FROM found e, query, LATERAL (SELECT e.words OFFSET 0) AS held
    WHERE (e.words @@ query.q OR e.id = ANY(query.near)
        -- A URL or an identifier given whole is found as it is, whatever the parser makes of it.
        OR e.sources @> jsonb_build_array(jsonb_build_object('url', ${text}::text))
        OR e.sources @> jsonb_build_array(jsonb_build_object('identifier', ${text}::text)))
      -- What the indexes find: the same matches, every field counted, so PostgreSQL reads them
      -- instead of every entry; the condition above then sets the hidden fields aside.
      AND (e.everything @@ query.q OR e.id = ANY(query.near)
        OR ${ofTypesWithHiddenFields('e')}
        OR e.sources @> jsonb_build_array(jsonb_build_object('url', ${text}::text))
        OR e.sources @> jsonb_build_array(jsonb_build_object('identifier', ${text}::text)))
      ${filters}
    ORDER BY ${byChange ? sql`e.updated DESC,` : byDate ? sql`${dated} DESC, e.id DESC,` : sql``} fit DESC,
      score DESC, rank DESC, e.title
    LIMIT ${options.limit ?? 20}`
  }
  const rows = yield* found(query === undefined ? listing : matching(query))
  // With a filter on what is supposed, what made each entry match.
  const supposed =
    wanted.length === 0
      ? undefined
      : yield* supposedIn(
          rows.map(({ id }) => id),
          wanted,
        )
  const results = yield* Effect.forEach(
    rows,
    ({ summary_provenance, date, score, total: _total, ...row }) =>
      Effect.map(pathOf(row.id), (path) =>
        Object.assign(
          { ...row, path } satisfies Found,
          date === null ? {} : { date },
          score === null ? {} : { score },
          summary_provenance === null ? {} : { summary_provenance },
          supposed === undefined
            ? {}
            : {
                supposed: (supposed.get(row.id) ?? []).map(({ what, provenance, by, when }) => ({
                  what,
                  provenance,
                  by,
                  when,
                })),
              },
        ),
      ),
  )
  return { results, total: rows[0]?.total ?? 0 }
})

/** The results of `searchWithTotal`, without the total. */
export const search = (...args: Parameters<typeof searchWithTotal>) =>
  Effect.map(searchWithTotal(...args), ({ results }) => results)
