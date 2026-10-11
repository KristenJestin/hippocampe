import { SearchOptions } from '@hippocampe/api/model'
import { neighborsOf } from '../../core/graph/index.ts'
import { Recency, search } from '../../core/search/index.ts'
import { Effect, Schema } from 'effect'
import { defineTool } from '../tool.ts'

/** How many neighbors each result comes with unless asked otherwise. */
const NEIGHBORS = 3

export const searchTool = defineTool({
  name: 'search',
  description:
    'Finds entries: with a `query`, a sentence or a few words, the entries that hold the most of its significant words, in the heaviest places (titles and aliases, then tags and summaries, then bodies), first, each with a `score` from 0 to 1 that says how solid it is; or without one, listed by most recent change. `sort`, `since`, `until` and `by` order and bound the search by the last change; each result says when (`updated`) and by which key (`by`). `sort: "dated"` keeps only the entries that happened at a time (their type is dated, `dated_by`), the most recent first: with `under`, what happened to a subject, further back than `read` gives. A result whose type is dated says the day it happened (`date`). Each result also comes with its `neighbors`, 3 by default: the entries next to it, explicit links first (a place it was part of is one), then the entries it is part of today (a link `part_of`), then the entries its fields name, then the entries its body cites, most recently updated first among equals. A neighbor is who it is (slug, title, type, summary) and how it is joined (`via`, `relation`, `direction`, the `note` of a link), never its body. `supposed: true` lists the entries that hold values that are not known (a field, the body, the summary or a link written `inferred`, or `ambiguous` when sources disagree), the most recently changed first, each result with its `supposed` list (what, how it stands, who wrote it, when); with `by`, the key that wrote the value: tell the owner what waits; they confirm it from the command line, or you write it again as known when they say so. A result whose summary is not known says `summary_provenance`. Read what you found and follow its neighbors as far as they help.',
  input: Schema.Struct({
    query: Schema.optionalKey(Schema.String).annotate({
      description:
        'What to search for: a sentence as a person says or writes it (600 characters at most), or a few words. It finds the entries that hold any of its significant words: the words the language of the instance drops weigh nothing, the others are matched whatever their form. Each result has a `score`, comparable from one search to another: the share of the significant words the entry holds, each weighed by how rare it is among the entries (a word most entries hold counts little) and counted 1 in its title or aliases, 0.4 in its tags or summary, 0.2 elsewhere; 1 when every word is in the title, near 0 when only common words matched. To require every word, quote a phrase (`"internet contract"`) or exclude a word with a minus (`-draft`). Left out, every entry the other filters keep is listed, the most recently changed first, with no score.',
    }),
    ...SearchOptions.fields,
    ...Recency.fields,
    neighbors: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
    ).annotate({
      description:
        'How many neighbors each result comes with, 3 by default and 10 at most; 0 gives none.',
    }),
  }),
  right: 'read',
  run: ({ query, neighbors, ...options }) =>
    Effect.gen(function* () {
      const results = yield* search(query, options)
      const count = neighbors ?? NEIGHBORS
      if (count === 0) return { results }
      const next = yield* neighborsOf(
        results.map(({ id }) => id),
        { count, archived: options.archived ?? false },
      )
      // The rows are this call's own: each gets its neighbors in place.
      return {
        results: results.map((result) =>
          Object.assign(result, { neighbors: next[result.id] ?? [] }),
        ),
      }
    }),
})
