import { ConfigProvider, Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import { beforeAll, describe, expect, test } from 'vitest'
import { migrate } from '../../src/core/database/index.ts'
import { writeEntry } from '../../src/core/entries/index.ts'
import { search } from '../../src/core/search/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabaseAs } from './scratch-database.ts'
import { computesWordsOnce, planOfSearch } from './search-plan.ts'

const inFrench = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { SEARCH_LANGUAGE: 'french' } })),
    ),
  )

const inferred = { body: 'inferred', summary: 'inferred' } as const

/** Invented people and places, as a voice transcription would name them, and common notes. */
const corpus = Effect.gen(function* () {
  yield* defineType({ name: 'note', label: 'Note', description: 'A free note.', fields: [] })
  yield* defineType({
    name: 'diary',
    label: 'Diary',
    description: 'A private page.',
    fields: [],
    sensitive: true,
  })
  yield* writeEntry({
    type: 'note',
    title: 'Paul Lagarde',
    slug: 'paul-lagarde',
    summary: 'Le plombier du quartier.',
    body: 'Passe le mardi, préfère être appelé le matin.',
    provenance: inferred,
  })
  yield* writeEntry({
    type: 'note',
    title: 'Inès Marchetti',
    slug: 'ines-marchetti',
    summary: 'La voisine du troisième.',
    provenance: { summary: 'inferred' },
  })
  yield* writeEntry({
    type: 'note',
    title: 'Atelier de céramique',
    slug: 'atelier-de-ceramique',
    aliases: ['Poterie Vasseur'],
    summary: 'Les cours du jeudi soir.',
    provenance: { summary: 'inferred' },
  })
  yield* writeEntry({
    type: 'note',
    title: 'Réunion de copropriété',
    slug: 'reunion-de-copropriete',
    body: 'Le syndic, monsieur Ferrandou, a présenté les comptes.',
    provenance: { body: 'inferred' },
  })
  yield* writeEntry({
    type: 'diary',
    title: 'Lettre à Quentin Bergeval',
    slug: 'lettre-a-quentin-bergeval',
    body: 'Jamais envoyée.',
    provenance: { body: 'inferred' },
  })
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(
    `INSERT INTO entries (type, title, slug, body, search_language)
     SELECT 'note', 'Carnet ' || n, 'carnet-' || n, 'Les carnets du jour.', 'hippocampe_french'
     FROM generate_series(1, 20) AS n`,
  )
}).pipe(inFrench)

const titles = (results: ReadonlyArray<{ title: string }>) => results.map(({ title }) => title)

describe('search with a misspelled name', () => {
  const { run, as } = useScratchDatabaseAs()
  beforeAll(() => run(corpus))
  const find = (query: string) => run(search(query).pipe(inFrench))

  test('a name with one letter wrong is found', async () => {
    expect((await find("Qu'est-ce que Lagarbe disait ?"))[0]?.title).toBe('Paul Lagarde')
  })

  test('a name with one letter missing is found', async () => {
    expect(titles(await find('Marhetti'))).toEqual(['Inès Marchetti'])
  })

  test('a name with one letter doubled is found, in the aliases too', async () => {
    expect(titles(await find('Laggarde'))).toEqual(['Paul Lagarde'])
    expect(titles(await find('Vassseur'))).toEqual(['Atelier de céramique'])
  })

  test('a word close to nothing is not found', async () => {
    expect(await find('zeppelin quokka')).toEqual([])
  })

  test('an exact match still ranks above a near one', async () => {
    // `Paul` is in a title as it is written, `Marchetty` near one: the exact word ranks first.
    const results = await find('Paul Marchetty')
    expect(titles(results)).toEqual(['Paul Lagarde', 'Inès Marchetti'])
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 1)
    // The same name scores 1 written as it is, and its similarity written near it.
    expect((await find('Lagarde'))[0]?.score).toBe(1)
    const [near] = await find('Lagarbe')
    expect(near?.score).toBeGreaterThan(0.6)
    expect(near?.score).toBeLessThan(1)
  })

  test('a name near a word of a body only is not found', async () => {
    expect(await find('Ferandou')).toEqual([])
    expect(titles(await find('Ferrandou'))).toEqual(['Réunion de copropriété'])
  })

  test('a name near an entry of a type the caller may not see is not found', async () => {
    expect(titles(await find('Bergueval'))).toEqual(['Lettre à Quentin Bergeval'])
    expect(await as(['read', 'write'])(search('Bergueval').pipe(inFrench))).toEqual([])
  })

  test('a quoted phrase or a word with a minus stays exact', async () => {
    expect(await find('"Lagarbe"')).toEqual([])
    expect(await find('Lagarbe -mardi')).toEqual([])
  })
})

describe('a sentence with a misspelled name, over a few thousand entries', () => {
  const { run } = useScratchDatabaseAs()
  const ENTRIES = 3000
  const WORDS = ['jardin', 'cuisine', 'facture', 'voiture', 'livre', 'concert', 'banque', 'piano']
  beforeAll(() =>
    run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* defineType({ name: 'note', label: 'Note', description: 'A note.', fields: [] })
        // As the sentence search suite generates them, and one person among them.
        yield* sql.unsafe(
          `INSERT INTO entries (type, title, slug, summary, body)
           SELECT 'note',
             initcap(w[1 + n % 8]) || ' ' || n,
             'generated-' || n,
             'Note sur ' || w[1 + (n / 8) % 8] || ' et ' || w[1 + (n / 64) % 8],
             repeat('Des mots au sujet de ' || w[1 + (n * 3) % 8] || ' et de ' || w[1 + (n * 5) % 8] || '. ', 20)
           FROM generate_series(1, ${ENTRIES}) AS n, (SELECT ARRAY['${WORDS.join("','")}'] AS w) AS words`,
        )
        yield* writeEntry({ type: 'note', title: 'Paul Lagarde', slug: 'paul-lagarde' })
        yield* migrate
        // As autovacuum does after so many rows: the names index reads its pending rows.
        yield* sql.unsafe('VACUUM ANALYZE entries')
      }).pipe(inFrench),
    ),
  )

  test('the plan of a sentence with a misspelled name reads the indexes, and computes the words of an entry once', async () => {
    const plan = await run(
      planOfSearch(
        search("Tu te souviens de ce qu'on avait noté sur le concert de Lagarbe ?"),
      ).pipe(inFrench),
    )
    expect(plan.some((line) => line.includes('Bitmap Index Scan on entries_names'))).toBe(true)
    expect(plan.some((line) => line.includes('Bitmap Index Scan on entries_search'))).toBe(true)
    expect(plan.some((line) => /Seq Scan on public\.entries e$/.test(line))).toBe(false)
    expect(computesWordsOnce(plan)).toBe(true)
  })

  test('a sentence with a misspelled name costs about what one word costs', async () => {
    const sentence = "Tu te souviens de ce qu'on avait noté sur le concert de Lagarbe ?"
    await run(search(sentence).pipe(inFrench))
    const timed = (query: string) =>
      Effect.gen(function* () {
        const start = performance.now()
        const results = yield* search(query)
        return { time: performance.now() - start, results }
      })
    const rounds = await run(
      Effect.forEach(Array.from({ length: 15 }), () =>
        Effect.all({ long: timed(sentence), short: timed('note') }),
      ).pipe(inFrench),
    )
    // A load slows some rounds, never speeds one up: the fastest round of each is the one the load
    // touched least, held to a bound a blow-up crosses; the plan, above, holds the finer one.
    const fastest = (times: ReadonlyArray<number>) => Math.min(...times)
    for (const { long } of rounds) {
      expect(titles(long.results)).toContain('Paul Lagarde')
    }
    expect(fastest(rounds.map(({ long }) => long.time))).toBeLessThan(
      fastest(rounds.map(({ short }) => short.time)) * 2.5,
    )
  })
})
