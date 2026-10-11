import { ConfigProvider, Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import { beforeAll, describe, expect, test } from 'vitest'
import { writeEntry } from '../../src/core/entries/index.ts'
import { search } from '../../src/core/search/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const inFrench = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { SEARCH_LANGUAGE: 'french' } })),
    ),
  )

/**
 * Invented projects whose names the notes filed under them repeat, so that the names are common
 * words of the instance, and a reminder whose word, `rappel`, only it holds.
 */
const corpus = Effect.gen(function* () {
  yield* defineType({ name: 'project', label: 'Project', description: 'A project.', fields: [] })
  yield* defineType({ name: 'note', label: 'Note', description: 'A free note.', fields: [] })
  yield* writeEntry({ type: 'project', title: 'Orla', slug: 'orla' })
  yield* writeEntry({
    type: 'project',
    title: 'Chantier de la grange',
    slug: 'chantier-de-la-grange',
    aliases: ['Néva'],
  })
  yield* writeEntry({ type: 'project', title: 'Moulin vert', slug: 'moulin-vert' })
  yield* writeEntry({
    type: 'note',
    title: 'Rappel du contrôle technique',
    slug: 'rappel-du-controle-technique',
  })
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(
    `INSERT INTO entries (type, title, slug, body, search_language)
     SELECT 'note', name || ' — tâche ' || n, slug || '-tache-' || n,
       'Suivi de ' || name || ', étape ' || n || '.', 'hippocampe_french'
     FROM generate_series(1, 30) AS n,
       (VALUES ('Orla', 'orla'), ('Néva', 'neva'), ('Moulin vert', 'moulin-vert')) AS project(name, slug)`,
  )
  yield* sql.unsafe(
    `INSERT INTO entries (type, title, slug, body, search_language)
     SELECT 'note', 'Carnet ' || n, 'carnet-' || n, 'Les carnets du jour.', 'hippocampe_french'
     FROM generate_series(1, 40) AS n`,
  )
}).pipe(inFrench)

describe('search with a sentence that says the name of an entry', () => {
  const run = useScratchDatabase()
  beforeAll(() => run(corpus))
  const find = (query: string) => run(search(query).pipe(inFrench))
  const scoreOf = (results: ReadonlyArray<{ slug: string; score?: number }>, slug: string) =>
    results.find((result) => result.slug === slug)?.score ?? 0

  test('a sentence that says the title of an entry ranks it first, however many entries hold the name', async () => {
    // `orla` is in thirty-one entries, `rappel` in one: by rarity alone, the reminder would win.
    const results = await find('Rappelle-moi où en est Orla')
    expect(results[0]?.slug).toBe('orla')
    expect(scoreOf(results, 'orla')).toBeGreaterThan(
      scoreOf(results, 'rappel-du-controle-technique'),
    )
    expect(scoreOf(results, 'orla')).toBeLessThanOrEqual(1)
  })

  test('a sentence that says an alias of an entry ranks it first, accents aside', async () => {
    const results = await find('rappelle-moi où en est neva')
    expect(results[0]?.slug).toBe('chantier-de-la-grange')
    expect(scoreOf(results, 'chantier-de-la-grange')).toBeGreaterThan(
      scoreOf(results, 'rappel-du-controle-technique'),
    )
  })

  test('a sentence that says a two-word title ranks its entry first', async () => {
    const results = await find('Rappelle-moi où en est le MOULIN VERT cet été')
    expect(results[0]?.slug).toBe('moulin-vert')
    expect(scoreOf(results, 'moulin-vert')).toBeGreaterThan(
      scoreOf(results, 'rappel-du-controle-technique'),
    )
  })

  test('a sentence that says only part of a name ranks by the rarity of its words, as before', async () => {
    // `moulin` alone names nothing: the rare `rappel` still makes the answer.
    const results = await find('Rappelle-moi où en est le moulin')
    expect(results[0]?.slug).toBe('rappel-du-controle-technique')
  })

  test('a sentence whose words are all the title of an entry still scores 1', async () => {
    const [found] = await find('le moulin vert')
    expect(found).toMatchObject({ slug: 'moulin-vert', score: 1 })
  })
})
