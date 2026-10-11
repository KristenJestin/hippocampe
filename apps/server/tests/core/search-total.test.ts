import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { archiveEntry, writeEntry } from '../../src/core/entries/index.ts'
import { Actor } from '../../src/core/events/index.ts'
import { search, searchWithTotal } from '../../src/core/search/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabaseAs } from './scratch-database.ts'

const { run, as } = useScratchDatabaseAs()

const BARE = ['read', 'write'] as const

/** Twelve invented notes under a shelf, a postcard and an archived sketch outside it. */
beforeAll(() =>
  run(
    Effect.gen(function* () {
      yield* defineType({ name: 'area', label: 'Area', description: 'Groups.', fields: [] })
      yield* defineType({ name: 'note', label: 'Note', description: 'A note.', fields: [] })
      yield* defineType({
        name: 'vault',
        label: 'Vault',
        description: 'Something private.',
        fields: [],
        sensitive: true,
      })
      yield* defineType({
        name: 'locker',
        label: 'Locker',
        description: 'A locker with a code.',
        fields: [
          { name: 'place', kind: 'text' },
          { name: 'code', kind: 'text', sensitive: true },
        ],
      })
      yield* writeEntry({ type: 'area', title: 'Shelf', slug: 'shelf' })
      for (const index of Array.from({ length: 12 }, (_, at) => at + 1)) {
        yield* writeEntry({
          type: 'note',
          title: `Lighthouse log ${index}`,
          summary: `Visit number ${index} to the lighthouse.`,
          body: `The keeper climbed the lighthouse stairs on day ${index}.`,
          tags: index % 2 === 0 ? ['even'] : [],
          parent: 'shelf',
          provenance: { summary: 'inferred', body: 'inferred', parent: 'inferred' },
        })
      }
      yield* writeEntry({
        type: 'note',
        title: 'Lighthouse postcard',
        summary: 'A card from the lighthouse.',
        provenance: { summary: 'inferred' },
      })
      yield* writeEntry({
        type: 'note',
        title: 'Lighthouse sketch',
        slug: 'lighthouse-sketch',
        summary: 'A drawing of the lighthouse.',
        provenance: { summary: 'inferred' },
      })
      yield* archiveEntry('lighthouse-sketch')
      yield* writeEntry({
        type: 'vault',
        title: 'Lighthouse vault',
        summary: 'Behind the door.',
        provenance: { summary: 'inferred' },
      })
      yield* writeEntry({
        type: 'locker',
        title: 'Harbour locker',
        fields: { place: 'pier', code: 'kelp' },
        provenance: { place: 'inferred', code: 'inferred' },
      })
      yield* writeEntry({
        type: 'locker',
        title: 'Dock locker',
        fields: { place: 'pier', code: 'reef' },
        provenance: { place: 'inferred', code: 'inferred' },
      })
    }),
  ),
)

describe('a search without a query is light and counts what the filters keep', () => {
  test('a listing has empty excerpts, not its summaries said twice', async () => {
    const { results } = await run(searchWithTotal(undefined, { type: 'note', limit: 5 }))
    expect(results).toHaveLength(5)
    expect(results.map(({ excerpt }) => excerpt)).toEqual(['', '', '', '', ''])
    expect(results.every(({ summary }) => summary !== '')).toBe(true)
  })

  test('the total of a listing is every entry the filters keep, also with a smaller limit', async () => {
    const { results, total } = await run(searchWithTotal(undefined, { type: 'note', limit: 3 }))
    expect(results).toHaveLength(3)
    expect(total).toBe(13)
    expect((await run(searchWithTotal(undefined, { type: 'note', limit: 100 }))).total).toBe(13)
  })

  test('a listing that keeps nothing has a total of zero', async () => {
    expect(await run(searchWithTotal(undefined, { type: 'note', tag: ['absent'] }))).toEqual({
      results: [],
      total: 0,
    })
  })

  test('the total of a search is the matches, not the results returned, and their excerpt is unchanged', async () => {
    const { results, total } = await run(searchWithTotal('lighthouse', { type: 'note', limit: 4 }))
    expect(results).toHaveLength(4)
    expect(total).toBe(13)
    for (const { excerpt } of results) expect(excerpt).toContain('<mark>')
  })

  test('the total counts the entries that match, not those that exist', async () => {
    expect((await run(searchWithTotal('keeper stairs', { type: 'note', limit: 1 }))).total).toBe(12)
    expect(await run(searchWithTotal('no such word anywhere'))).toEqual({ results: [], total: 0 })
  })

  test('search keeps answering the results alone', async () => {
    expect(await run(search('lighthouse', { type: 'note', limit: 4 }))).toHaveLength(4)
  })
})

describe('the total follows the filters and what the key may see', () => {
  test('under counts the descendants of an entry, with and without a query', async () => {
    expect((await run(searchWithTotal(undefined, { under: 'shelf', limit: 2 }))).total).toBe(12)
    expect((await run(searchWithTotal('lighthouse', { under: 'shelf', limit: 2 }))).total).toBe(12)
  })

  test('archived entries are left out of the total unless asked for', async () => {
    expect((await run(searchWithTotal(undefined, { type: 'note', limit: 1 }))).total).toBe(13)
    expect(
      (await run(searchWithTotal(undefined, { type: 'note', archived: true, limit: 1 }))).total,
    ).toBe(14)
    expect((await run(searchWithTotal('sketch', { archived: true }))).total).toBe(1)
    expect((await run(searchWithTotal('sketch'))).total).toBe(0)
  })

  test('a tag, the other filters and the certainty filters narrow the total', async () => {
    expect(
      (await run(searchWithTotal(undefined, { type: 'note', tag: ['even'], limit: 1 }))).total,
    ).toBe(6)
    expect(
      (await run(searchWithTotal('lighthouse', { type: 'note', tag: ['even'], limit: 1 }))).total,
    ).toBe(6)
    expect(
      (await run(searchWithTotal(undefined, { supposed: true, type: 'note', limit: 1 }))).total,
    ).toBe(13)
    expect(
      (await run(Effect.provideService(searchWithTotal(undefined, { by: 'nobody' }), Actor, 'x')))
        .total,
    ).toBe(0)
    expect(
      (await run(searchWithTotal(undefined, { since: '2999-01-01', type: 'note' }))).total,
    ).toBe(0)
  })

  test('a type the key may not see is not counted, with or without a query', async () => {
    expect((await run(searchWithTotal(undefined, { limit: 1 }))).total).toBe(17)
    expect((await run(searchWithTotal('vault'))).total).toBe(1)
    expect((await as(BARE)(searchWithTotal(undefined, { limit: 1 }))).total).toBe(16)
    expect((await as(BARE)(searchWithTotal('vault'))).total).toBe(0)
    expect((await as(BARE)(searchWithTotal('lighthouse', { limit: 1 }))).total).toBe(13)
  })

  test('a word held only in a field the key may not see does not count', async () => {
    expect((await run(searchWithTotal('kelp'))).total).toBe(1)
    expect((await as(BARE)(searchWithTotal('kelp'))).total).toBe(0)
    expect((await as(BARE)(searchWithTotal('pier', { limit: 1 }))).total).toBe(2)
  })
})
