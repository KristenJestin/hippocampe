import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { Rights } from '../../src/core/auth/index.ts'
import { archiveEntry, filterEntries, writeEntry } from '../../src/core/entries/index.ts'
import { Actor } from '../../src/core/events/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

const as =
  (actor: string, rights: ReadonlyArray<'read' | 'write' | 'sensitive'> = ['read', 'write']) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(Effect.provideService(effect, Actor, actor), Rights, rights)

beforeAll(() =>
  run(
    Effect.gen(function* () {
      yield* defineType({ name: 'thing', label: 'Thing', description: 'A thing.', fields: [] })
      yield* defineType({
        name: 'secret',
        label: 'Secret',
        description: 'A secret thing.',
        fields: [],
        sensitive: true,
      })
      // Written out of order, so that neither the title nor the creation says the last change.
      for (const [title, updated, actor] of [
        ['Cedar shelf', '2026-10-01T08:00:00Z', 'agent-first'],
        ['Alder shelf', '2026-10-03T08:00:00Z', 'agent-second'],
        ['Birch shelf', '2026-10-05T08:00:00Z', 'agent-first'],
        ['Elm shelf', '2026-10-04T08:00:00Z', 'agent-second'],
        ['Fir shelf', '2026-10-02T08:00:00Z', 'agent-first'],
      ] as const)
        yield* as(actor)(writeEntry({ type: 'thing', title, created: '2026-09-01', updated }))
      yield* as('agent-first', ['read', 'write', 'sensitive'])(
        writeEntry({
          type: 'secret',
          title: 'Locked drawer',
          created: '2026-09-01',
          updated: '2026-10-09T08:00:00Z',
        }),
      )
      yield* as('agent-first')(
        writeEntry({
          type: 'thing',
          title: 'Gone shelf',
          created: '2026-09-01',
          updated: '2026-10-08T08:00:00Z',
        }),
      )
      yield* as('agent-first')(archiveEntry('gone-shelf', 'done'))
    }),
  ),
)

const slugs = (entries: ReadonlyArray<{ readonly slug: string }>) => entries.map(({ slug }) => slug)

describe('the entries listed by their last change', () => {
  test('the entries are listed by their last change, newest first', async () => {
    const { entries } = await run(
      as('agent-reader')(filterEntries({ type: 'thing', sort: 'updated' })),
    )
    // 'Gone shelf' was archived just now, so it is the latest change but is not listed.
    expect(slugs(entries)).toEqual([
      'birch-shelf',
      'elm-shelf',
      'alder-shelf',
      'fir-shelf',
      'cedar-shelf',
    ])
  })

  test('the entries are listed by their last change, a page at a time', async () => {
    const first = await run(
      as('agent-reader')(filterEntries({ type: 'thing', sort: 'updated', limit: 2 })),
    )
    expect(slugs(first.entries)).toEqual(['birch-shelf', 'elm-shelf'])
    expect(first.next_cursor).not.toBeNull()
    const second = await run(
      as('agent-reader')(
        filterEntries({
          type: 'thing',
          sort: 'updated',
          limit: 2,
          cursor: first.next_cursor ?? undefined,
        }),
      ),
    )
    expect(slugs(second.entries)).toEqual(['alder-shelf', 'fir-shelf'])
    const last = await run(
      as('agent-reader')(
        filterEntries({
          type: 'thing',
          sort: 'updated',
          limit: 2,
          cursor: second.next_cursor ?? undefined,
        }),
      ),
    )
    expect(slugs(last.entries)).toEqual(['cedar-shelf'])
    expect(last.next_cursor).toBeNull()
  })

  test('an entry listed by its last change says when and by which key', async () => {
    const { entries } = await run(
      as('agent-reader')(filterEntries({ type: 'thing', sort: 'updated', limit: 2 })),
    )
    expect(entries[0]).toMatchObject({
      slug: 'birch-shelf',
      updated: '2026-10-05T08:00:00.000000Z',
      by: 'agent-first',
    })
    expect(entries[1]).toMatchObject({
      slug: 'elm-shelf',
      updated: '2026-10-04T08:00:00.000000Z',
      by: 'agent-second',
    })
  })

  test('an entry the key may not read is left out of the recent changes', async () => {
    const plain = await run(as('agent-plain', ['read'])(filterEntries({ sort: 'updated' })))
    expect(slugs(plain.entries)).not.toContain('locked-drawer')
    const trusted = await run(
      as('agent-trusted', ['read', 'sensitive'])(filterEntries({ sort: 'updated' })),
    )
    expect(trusted.entries[0]).toMatchObject({ slug: 'locked-drawer', by: 'agent-first' })
  })

  test('a listing by title says nothing of the last change', async () => {
    const { entries } = await run(as('agent-reader')(filterEntries({ type: 'thing', limit: 1 })))
    expect(entries[0]).toEqual(
      expect.not.objectContaining({ updated: expect.anything(), by: expect.anything() }),
    )
    expect(Object.keys(entries[0] ?? {})).not.toContain('updated')
  })

  test('a cursor of the listing by title is refused by the listing by last change, and back', async () => {
    const byTitle = await run(as('agent-reader')(filterEntries({ type: 'thing', limit: 1 })))
    const byChange = await run(
      as('agent-reader')(filterEntries({ type: 'thing', sort: 'updated', limit: 1 })),
    )
    const refused = (cursor: string | null | undefined, sort: 'title' | 'updated') =>
      run(
        as('agent-reader')(
          filterEntries({ type: 'thing', sort, cursor: cursor ?? undefined }),
        ).pipe(Effect.flip),
      )
    expect((await refused(byTitle.next_cursor, 'updated')).message).toContain('is not one')
    expect((await refused(byChange.next_cursor, 'title')).message).toContain('is not one')
  })
})
