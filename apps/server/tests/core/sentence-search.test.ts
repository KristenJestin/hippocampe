import { ConfigProvider, Effect } from 'effect'
import { SqlClient } from 'effect/sql'
import { beforeAll, describe, expect, test } from 'vitest'
import { Rights } from '../../src/core/auth/index.ts'
import { migrate } from '../../src/core/database/index.ts'
import { writeEntry } from '../../src/core/entries/index.ts'
import { search } from '../../src/core/search/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const inLanguage =
  (language: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provide(
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { SEARCH_LANGUAGE: language } })),
      ),
    )
const inFrench = inLanguage('french')

const inferred = { body: 'inferred', summary: 'inferred' } as const

/** A small invented corpus: a music server, an internet subscription, a recipe, a decision. */
const corpus = Effect.gen(function* () {
  yield* defineType({ name: 'note', label: 'Note', description: 'A free note.', fields: [] })
  yield* defineType({ name: 'recipe', label: 'Recipe', description: 'To cook.', fields: [] })
  yield* defineType({
    name: 'subscription',
    label: 'Subscription',
    description: 'Something paid every month.',
    fields: [
      { name: 'provider', kind: 'text' },
      { name: 'customer_number', kind: 'text', sensitive: true },
    ],
  })
  yield* writeEntry({
    type: 'note',
    title: 'Serveur de musique',
    slug: 'serveur-de-musique',
    tags: ['maison'],
    summary: 'Le serveur qui diffuse les albums dans le salon.',
    body: 'Installé sur un vieux portable, branché sur la chaîne.',
    provenance: inferred,
  })
  yield* writeEntry({
    type: 'subscription',
    title: 'Abonnement internet',
    slug: 'abonnement-internet',
    aliases: ['box fibre'],
    summary: "La fibre de l'appartement.",
    body: 'Contrat signé en mars, résiliable chaque mois. Échéance en septembre.',
    fields: { provider: 'Opérateur Exemple', customer_number: 'quetzal' },
    provenance: { ...inferred, provider: 'inferred', customer_number: 'inferred' },
  })
  yield* writeEntry({
    type: 'recipe',
    title: 'Tarte aux pommes',
    slug: 'tarte-aux-pommes',
    body: 'Éplucher les pommes, étaler la pâte, cuire quarante minutes.',
    provenance: inferred,
  })
  yield* writeEntry({
    type: 'note',
    title: 'Décision sur la musique',
    slug: 'decision-sur-la-musique',
    tags: ['maison'],
    summary: 'Ce qui a été décidé pour la collection.',
    body: 'Garder les vinyles, numériser les cassettes.',
    provenance: inferred,
  })
  yield* defineType({
    name: 'outing',
    label: 'Outing',
    description: 'Somewhere we went, on a day.',
    fields: [{ name: 'day', kind: 'date', required: true }],
    dated_by: 'day',
  })
  yield* defineType({
    name: 'diary',
    label: 'Diary',
    description: 'A private page.',
    fields: [],
    sensitive: true,
  })
  yield* writeEntry({
    type: 'outing',
    title: 'Sortie au parc',
    slug: 'sortie-au-parc',
    parent: 'decision-sur-la-musique',
    body: 'Un orchestre jouait près du kiosque.',
    fields: { day: '2026-06-21' },
    provenance: { body: 'inferred', parent: 'inferred', day: 'inferred' },
  })
  yield* writeEntry({
    type: 'diary',
    title: 'Page du soir',
    body: "L'orchestre était trop fort.",
    provenance: { body: 'inferred' },
  })
  yield* writeEntry({
    type: 'note',
    title: 'Vélo de route',
    slug: 'velo-de-route',
    body: "Changer les pneus avant l'été.",
    provenance: inferred,
  })
  // A title made of the common words of a spoken question, beside the entry it is about.
  yield* writeEntry({ type: 'note', title: 'Où et quand rappeler', slug: 'ou-et-quand-rappeler' })
  // What makes words common: forty notes that hold them, as a real instance would.
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(
    `INSERT INTO entries (type, title, slug, body, search_language)
     SELECT 'note', 'Carnet ' || n, 'carnet-' || n,
       'Où est-ce que je le range, et quand je rappelle ? Les carnets du jour.',
       'hippocampe_french'
     FROM generate_series(1, 40) AS n`,
  )
}).pipe(inFrench)

const titles = (results: ReadonlyArray<{ title: string }>) => results.map(({ title }) => title)

describe('search with a sentence, in French', () => {
  const run = useScratchDatabase()
  beforeAll(() => run(corpus))
  const find = (query: string, options: Parameters<typeof search>[1] = {}) =>
    run(search(query, options).pipe(inFrench))

  test('a question in spoken French, filler words and all, finds the entry it is about', async () => {
    const results = await find("Qu'est-ce qu'on avait décidé pour la musique ?")
    expect(results[0]?.title).toBe('Décision sur la musique')
  })

  test('a sentence whose words are only partly in an entry still finds it', async () => {
    const results = await find('Rappelle-moi où en est le contrat internet')
    expect(results[0]?.title).toBe('Abonnement internet')
  })

  test('the common words of a spoken question do not outrank the word that matters', async () => {
    // `Où et quand rappeler` holds `où`, `quand` and `rappel` in its title, and forty notes hold
    // them too: the rare words, `contrat`, `internet` and `échéance`, make the answer.
    const answers = await Promise.all(
      [
        'Rappelle-moi où en est le contrat internet',
        "C'est quand l'échéance du contrat internet ?",
      ].map((question) => find(question)),
    )
    for (const [first, ...others] of answers) {
      expect(first?.title).toBe('Abonnement internet')
      const decoy = others.find(({ slug }) => slug === 'ou-et-quand-rappeler')
      expect(decoy?.score).toBeLessThan((first?.score ?? 0) / 2)
    }
  })

  test('a word most entries hold weighs little, a word no entry holds weighs much', async () => {
    // `carnet` is in forty notes of fifty: `musique` in a title is nearly all of the answer.
    const server = (results: ReadonlyArray<{ title: string; score?: number }>) =>
      results.find(({ title }) => title === 'Serveur de musique')?.score
    const common = await find('musique carnet')
    expect(titles(common.slice(0, 2)).sort()).toEqual([
      'Décision sur la musique',
      'Serveur de musique',
    ])
    expect(server(common)).toBeGreaterThan(0.85)
    // `zeppelin` is nowhere: what was asked was not found, whatever `musique` finds.
    expect(server(await find('musique zeppelin'))).toBeLessThan(0.5)
  })

  test('plural and conjugated forms find the entry written otherwise', async () => {
    expect((await find('les tartes avec des pommes'))[0]?.title).toBe('Tarte aux pommes')
    expect((await find('on décidait quoi déjà ?'))[0]?.title).toBe('Décision sur la musique')
    expect((await find('on a gardé les vinyles'))[0]?.title).toBe('Décision sur la musique')
  })

  test('a word finds the same entry with or without its accents', async () => {
    expect(titles(await find('le velo'))).toEqual(['Vélo de route'])
    expect(titles(await find('le vélo'))).toEqual(['Vélo de route'])
    expect(titles(await find('la chaine'))).toEqual(['Serveur de musique'])
  })

  test('a query whose words are all in a title scores 1', async () => {
    const [found] = await find('le serveur de musique')
    expect(found).toMatchObject({ title: 'Serveur de musique', score: 1 })
  })

  test('each word counts by the heaviest place it is found in, and the share of words found', async () => {
    // `musique` is in both titles; `vinyles` only in the body of the decision, where it counts
    // 0.2 of what it would in a title.
    const results = await find('musique vinyles')
    expect(titles(results)).toEqual(['Décision sur la musique', 'Serveur de musique'])
    const [decision, server] = results.map(({ score }) => score ?? 0)
    expect(decision).toBeGreaterThan(server ?? 1)
    expect(decision).toBeLessThan(1)
    // One word, alone in a query, counts what its place counts: 0.4 in a summary or the tags.
    expect((await find('appartement'))[0]?.score).toBeCloseTo(0.4)
  })

  test('the entry that holds more of the words, in heavier places, ranks first', async () => {
    const results = await find('la musique du salon')
    expect(titles(results)).toEqual(['Serveur de musique', 'Décision sur la musique'])
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 1)
  })

  test('a query with no significant word found returns nothing', async () => {
    expect(await find('zeppelin quokka')).toEqual([])
    expect(await find('de la et du')).toEqual([])
  })

  test('a quoted phrase or a word with a minus still requires every word', async () => {
    expect(titles(await find('"décidé" musique'))).toEqual(['Décision sur la musique'])
    expect(titles(await find('musique -vinyles'))).toEqual(['Serveur de musique'])
    // The excluded word is not one the score looks for.
    expect((await find('musique -vinyles'))[0]?.score).toBe(1)
  })

  test('the excerpt marks every word found', async () => {
    const [found] = await find('musique vinyles')
    expect(found?.excerpt).toContain('<mark>musique</mark>')
    expect(found?.excerpt).toContain('<mark>vinyles</mark>')
  })

  test('the filters keep working with a sentence', async () => {
    const sentence = 'la musique et la tarte aux pommes'
    expect(titles(await find(sentence, { type: 'recipe' }))).toEqual(['Tarte aux pommes'])
    expect(titles(await find(sentence, { tag: ['maison'] })).sort()).toEqual([
      'Décision sur la musique',
      'Serveur de musique',
    ])
    expect(titles(await find(sentence, { sort: 'updated' }))).toEqual([
      'Décision sur la musique',
      'Tarte aux pommes',
      'Serveur de musique',
    ])
    expect(await find(sentence, { since: '2999-01-01' })).toEqual([])
    expect(titles(await find(sentence, { by: 'test-suite' }))).toHaveLength(3)
  })

  test('the places, dates, hidden types and supposed values keep working with a sentence', async () => {
    const sentence = "et l'orchestre, alors ?"
    expect(titles(await find(sentence)).sort()).toEqual(['Page du soir', 'Sortie au parc'])
    expect(titles(await find(sentence, { under: 'decision-sur-la-musique' }))).toEqual([
      'Sortie au parc',
    ])
    expect(await find(sentence, { under: 'velo-de-route' })).toEqual([])
    const [dated] = await find(sentence, { sort: 'dated' })
    expect(dated).toMatchObject({ title: 'Sortie au parc', date: '2026-06-21' })
    expect(titles(await find(sentence, { sort: 'dated' }))).toEqual(['Sortie au parc'])
    expect(titles(await find(sentence, { supposed: true })).sort()).toEqual([
      'Page du soir',
      'Sortie au parc',
    ])
    expect(await find(sentence, { unstated: true })).toEqual([])
    const plain = await run(
      Effect.provideService(search(sentence), Rights, ['read', 'write']).pipe(inFrench),
    )
    expect(titles(plain)).toEqual(['Sortie au parc'])
  })

  test('a field the caller may not see is not matched by a sentence', async () => {
    const plain = (query: string) =>
      run(Effect.provideService(search(query), Rights, ['read', 'write']).pipe(inFrench))
    expect(titles(await plain('le client quetzal'))).toEqual([])
    expect(titles(await find('le client quetzal'))).toEqual(['Abonnement internet'])
  })

  test('a listing without a query gives no score', async () => {
    const results = await run(search(undefined, { limit: 3 }).pipe(inFrench))
    expect(results).toHaveLength(3)
    for (const result of results) expect(result).not.toHaveProperty('score')
  })

  test('a query longer than a sentence needs is refused', async () => {
    const error = await run(search('musique '.repeat(80)).pipe(inFrench, Effect.flip))
    expect(error.message).toBe(
      'A `query` is a sentence, 600 characters at most: this one has 640. Keep the words that matter.',
    )
  })
})

describe('search with a sentence, in the default language', () => {
  const run = useScratchDatabase()
  beforeAll(() =>
    run(
      Effect.gen(function* () {
        yield* defineType({ name: 'note', label: 'Note', description: 'A note.', fields: [] })
        yield* writeEntry({
          type: 'note',
          title: 'Music decision',
          body: 'We keep the records.',
          provenance: { body: 'inferred' },
        })
        yield* writeEntry({ type: 'note', title: 'Bike tyres' })
        yield* writeEntry({
          type: 'note',
          title: 'Odd link',
          body: "Manual at example.org/it's-here.",
          provenance: { body: 'inferred' },
        })
      }),
    ),
  )

  test('without stop words, every word of a sentence counts, and it still finds the entry', async () => {
    const results = await run(search('what did we decide about the music'))
    expect(titles(results)).toEqual(['Music decision'])
    // Seven words, `music` in the title, `we` and `the` in the body: a part of the answer only.
    expect(results[0]?.score).toBeGreaterThan(0)
    expect(results[0]?.score).toBeLessThan(0.5)
  })

  test('a word with a quote in it, as a URL may hold, is searched as it is', async () => {
    const results = await run(search("where is example.org/it's-here"))
    expect(titles(results)).toEqual(['Odd link'])
  })
})

describe('a sentence over a few thousand entries', () => {
  const run = useScratchDatabase()
  const ENTRIES = 3000
  const WORDS = ['jardin', 'cuisine', 'facture', 'voiture', 'livre', 'concert', 'banque', 'piano']
  beforeAll(() =>
    run(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* defineType({ name: 'note', label: 'Note', description: 'A note.', fields: [] })
        // Generated entries, each with a title, a summary and a body made of the words above.
        yield* sql.unsafe(
          `INSERT INTO entries (type, title, slug, summary, body)
           SELECT 'note',
             initcap(w[1 + n % 8]) || ' ' || n,
             'generated-' || n,
             'Note sur ' || w[1 + (n / 8) % 8] || ' et ' || w[1 + (n / 64) % 8],
             repeat('Des mots au sujet de ' || w[1 + (n * 3) % 8] || ' et de ' || w[1 + (n * 5) % 8] || '. ', 20)
           FROM generate_series(1, ${ENTRIES}) AS n, (SELECT ARRAY['${WORDS.join("','")}'] AS w) AS words`,
        )
        // Indexed again in French, as a change of SEARCH_LANGUAGE does.
        yield* migrate
        yield* sql.unsafe('ANALYZE entries')
      }).pipe(inFrench),
    ),
  )

  test('a sentence costs about what one word costs, over the same entries', async () => {
    const sentence = "Tu te souviens de ce qu'on avait noté sur le concert et le piano ?"
    // The first search creates the configuration and warms the caches: it is not measured.
    await run(search(sentence).pipe(inFrench))
    /** How long a search takes, and how many entries it gives. */
    const timed = (query: string) =>
      Effect.gen(function* () {
        const start = performance.now()
        const results = yield* search(query)
        return { time: performance.now() - start, found: results.length }
      })
    // Turn about, one after the other, so that a load on the machine weighs on both alike.
    const rounds = await run(
      Effect.forEach(Array.from({ length: 7 }), () =>
        Effect.all({ long: timed(sentence), short: timed('note') }),
      ).pipe(inFrench),
    )
    const median = (times: ReadonlyArray<number>) =>
      [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? Infinity
    expect(rounds.flatMap(({ long, short }) => [long.found, short.found])).toEqual(
      Array.from({ length: 14 }, () => 20),
    )
    // Every entry holds a word of the sentence, and the word: the worst case. Alone, the sentence
    // took about 50 ms and the word 39 ms (counting how rare each word is costs about 1 ms a
    // word); a search that computed the words of an entry again for each word of the query was
    // 1.8 times the word. The time of a search varies forty-fold with the load of the machine
    // (over a second in a full check), not this ratio.
    expect(median(rounds.map(({ long }) => long.time))).toBeLessThan(
      median(rounds.map(({ short }) => short.time)) * 1.5,
    )
  })
})
