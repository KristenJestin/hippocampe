import { HIDDEN } from '@hippocampe/api/model'
import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { Rights } from '../../src/core/auth/index.ts'
import type { Right } from '../../src/core/auth/index.ts'
import { archiveEntry, confirmValue, readEntry, writeEntry } from '../../src/core/entries/index.ts'
import { Actor, entryHistory } from '../../src/core/events/index.ts'
import { confirmLink, link, linksOf } from '../../src/core/links/index.ts'
import { ownerEntry, setOwnerEntry } from '../../src/core/owner.ts'
import { Refused } from '../../src/core/refused.ts'
import { defineType } from '../../src/core/types/index.ts'
import { instructions } from '../../src/mcp/instructions.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

const asOwner = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(
    Effect.provideService(effect, Rights, ['read', 'write', 'sensitive', 'owner']),
    Actor,
    'owner',
  )

/** What a key with these rights does, as the key `agent-desk`. */
const asKey =
  (rights: ReadonlyArray<Right>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(Effect.provideService(effect, Rights, rights), Actor, 'agent-desk')

const byAgent = asKey(['read', 'write'])

/** What a session of a key with these rights is told when it starts. */
const toldTo = (rights: ReadonlyArray<Right>) => run(asKey(rights)(instructions))

/** A remark the owner told on that day, as an agent writes it. */
const told = (title: string, on = '2026-10-08') =>
  byAgent(
    writeEntry({
      type: 'remark',
      title,
      fields: { text: 'The boiler was serviced.' },
      provenance: { text: 'extracted' },
      sources: [{ said_by: 'owner', on }],
    }),
  )

beforeAll(() =>
  run(
    Effect.gen(function* () {
      yield* defineType({
        name: 'person',
        label: 'Person',
        description: 'A person.',
        fields: [],
      })
      yield* defineType({
        name: 'self',
        label: 'Self',
        description: 'Who someone is, kept private.',
        fields: [],
        sensitive: true,
      })
      yield* defineType({
        name: 'remark',
        label: 'Remark',
        description: 'Something said.',
        fields: [{ name: 'text', kind: 'text' }],
      })
      yield* writeEntry({ type: 'person', title: 'Ada Lind' })
      yield* writeEntry({ type: 'person', title: 'Samir Haddad' })
      yield* writeEntry({ type: 'person', title: 'Old Self' })
      yield* archiveEntry('old-self', 'A duplicate.')
      yield* writeEntry({ type: 'self', title: 'Private Self' })
    }),
  ),
)

describe('the owner names the entry that stands for them', () => {
  test('without one named, the owner has no entry', async () => {
    expect(await run(asOwner(ownerEntry))).toBeNull()
  })

  test('naming an entry makes it the owner entry, recorded in the event log', async () => {
    await run(asOwner(setOwnerEntry('ada-lind')))
    expect(await run(asOwner(ownerEntry))).toMatchObject({ slug: 'ada-lind', title: 'Ada Lind' })
    expect((await run(entryHistory('ada-lind'))).at(-1)).toMatchObject({
      actor: 'owner',
      action: 'owner',
      changes: [{ field: 'owner', before: false, after: true }],
    })
  })

  test('naming another entry moves it, recorded on both', async () => {
    await run(asOwner(setOwnerEntry('samir-haddad')))
    expect(await run(asOwner(ownerEntry))).toMatchObject({ slug: 'samir-haddad' })
    expect((await run(entryHistory('ada-lind'))).at(-1)).toMatchObject({
      action: 'owner',
      changes: [{ field: 'owner', before: true, after: false }],
    })
    expect((await run(entryHistory('samir-haddad'))).at(-1)).toMatchObject({
      action: 'owner',
      changes: [{ field: 'owner', before: false, after: true }],
    })
  })

  test('clearing it leaves the owner without an entry, recorded on the one it was', async () => {
    await run(asOwner(setOwnerEntry(null)))
    expect(await run(asOwner(ownerEntry))).toBeNull()
    expect((await run(entryHistory('samir-haddad'))).at(-1)).toMatchObject({
      action: 'owner',
      changes: [{ field: 'owner', before: true, after: false }],
    })
  })

  test('an entry that does not exist is refused, saying what to fix', async () => {
    expect(await run(asOwner(refusalOf(setOwnerEntry('nobody'))))).toBe(
      'The entry `nobody` does not exist: name the entry that stands for you, by its slug or id.',
    )
  })

  test('an archived entry is refused, saying what to fix', async () => {
    expect(await run(asOwner(refusalOf(setOwnerEntry('old-self'))))).toBe(
      'The entry `old-self` is archived: name an entry that is not.',
    )
    expect(await run(asOwner(ownerEntry))).toBeNull()
  })

  test('only the owner names it', async () => {
    expect(
      await run(asKey(['read', 'write', 'sensitive'])(refusalOf(setOwnerEntry('ada-lind')))),
    ).toBe(
      'Only the owner names the entry that stands for them, from the command line (`owner:entry`).',
    )
  })
})

describe('said_by owner follows the owner entry', () => {
  test('before the owner names an entry, said_by owner is kept as owner', async () => {
    await run(asOwner(setOwnerEntry(null)))
    await run(told('Told before'))
    expect((await run(readEntry('told-before'))).entry.sources).toEqual([
      { said_by: 'owner', on: '2026-10-08' },
    ])
  })

  test('once named, said_by owner is kept as that entry, read back with its slug', async () => {
    await run(asOwner(setOwnerEntry('ada-lind')))
    const written = await run(told('Told after'))
    expect(written.sources).toMatchObject([
      { slug: 'ada-lind', title: 'Ada Lind', on: '2026-10-08' },
    ])
    const ada = await run(readEntry('ada-lind'))
    expect((await run(readEntry('told-after'))).entry.sources).toEqual([
      { said_by: ada.entry.id, slug: 'ada-lind', title: 'Ada Lind', on: '2026-10-08' },
    ])
  })

  test('sources written as owner before the entry was named are left as they are', async () => {
    const before = await run(readEntry('told-before'))
    expect(before.entry.sources).toEqual([{ said_by: 'owner', on: '2026-10-08' }])
    // Written back as read, by an agent that changes something else: still the owner's word.
    await run(
      byAgent(
        writeEntry({
          entry: 'told-before',
          summary: 'The boiler, serviced.',
          provenance: { summary: 'extracted' },
          sources: before.entry.sources,
        }),
      ),
    )
    expect((await run(readEntry('told-before'))).entry.sources).toEqual([
      { said_by: 'owner', on: '2026-10-08' },
    ])
  })

  test('a key that may not see the owner entry reads the source hidden, and writing it back keeps it', async () => {
    await run(asOwner(setOwnerEntry('private-self')))
    await run(told('Told privately'))
    const read = await run(byAgent(readEntry('told-privately')))
    expect(read.entry.sources).toEqual([
      { said_by: HIDDEN, slug: HIDDEN, title: HIDDEN, on: '2026-10-08' },
    ])
    await run(
      byAgent(
        writeEntry({
          entry: 'told-privately',
          summary: 'Serviced.',
          provenance: { summary: 'extracted' },
          sources: [{ said_by: HIDDEN, on: '2026-10-08' }],
        }),
      ),
    )
    expect((await run(readEntry('told-privately'))).entry.sources).toMatchObject([
      { slug: 'private-self', on: '2026-10-08' },
    ])
  })

  test('a hidden source with nothing hidden to put back is refused without the way out of what was told', async () => {
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Told by a marker',
              sources: [{ said_by: HIDDEN, on: '2026-10-08' }],
            }),
          ),
        ),
      ),
    ).toBe(
      'The source `sources.0` names `[hidden]`, the marker of an entry this key may not see, and this entry cites no such entry to put back: leave the source out, or cite one this key may see.',
    )
  })
})

describe('the instructions name the owner entry', () => {
  test('a key that reads is told, near the top, the owner entry by its slug and title', async () => {
    await run(asOwner(setOwnerEntry('ada-lind')))
    const paragraphs = (await toldTo(['read', 'write'])).split('\n\n')
    expect(paragraphs[1]).toBe(
      'The owner of this instance is `ada-lind` (Ada Lind): read it when what you do depends on who they are.',
    )
  })

  test('a key that may not see the owner entry is told nothing of it', async () => {
    await run(asOwner(setOwnerEntry('private-self')))
    const said = await toldTo(['read', 'write'])
    expect(said).not.toContain('The owner of this instance is')
    expect(said).not.toContain('private-self')
    expect(said).not.toContain('Private Self')
    expect(await toldTo(['read', 'write', 'sensitive'])).toContain(
      'The owner of this instance is `private-self` (Private Self)',
    )
  })

  test('a key that does not read, and an owner without an entry, are told nothing of it', async () => {
    await run(asOwner(setOwnerEntry('ada-lind')))
    expect(await toldTo(['write'])).not.toContain('The owner of this instance is')
    await run(asOwner(setOwnerEntry(null)))
    expect(await toldTo(['read', 'write'])).not.toContain('The owner of this instance is')
  })
})

describe('supposed:confirm cites the owner entry when no person is named', () => {
  beforeAll(() =>
    run(
      Effect.gen(function* () {
        yield* writeEntry({
          type: 'remark',
          title: 'Supposed once',
          fields: { text: 'Serviced in spring.' },
          provenance: { text: 'inferred' },
        })
        yield* writeEntry({
          type: 'remark',
          title: 'Supposed twice',
          fields: { text: 'Serviced in autumn.' },
          provenance: { text: 'inferred' },
        })
        yield* link('supposed-once', 'supposed-twice', 'relates_to', '', '', {
          provenance: 'inferred',
        })
      }),
    ),
  )

  test('without an owner entry and without a person, the refusal says how to name one', async () => {
    await run(asOwner(setOwnerEntry(null)))
    expect(await run(asOwner(refusalOf(confirmValue('supposed-once', 'text'))))).toBe(
      'Say who confirms with `--as <slug of your entry>`, or name the entry that stands for you once, with `owner:entry <slug or id>`; `--as owner` cites you with no entry.',
    )
  })

  test('as owner, without an owner entry, cites the owner with no entry', async () => {
    const confirmed = await run(asOwner(confirmValue('supposed-once', 'text', 'owner')))
    expect(confirmed.sources).toEqual([{ said_by: 'owner', on: expect.any(String) }])
  })

  test('without a person, the owner entry is cited', async () => {
    await run(asOwner(setOwnerEntry('ada-lind')))
    const confirmed = await run(asOwner(confirmValue('supposed-twice', 'text')))
    expect(confirmed.sources).toMatchObject([{ slug: 'ada-lind', on: expect.any(String) }])
    await run(asOwner(confirmLink('supposed-once', 'relates_to', 'supposed-twice')))
    expect((await run(linksOf('supposed-once')))[0]?.provenance).toBe('extracted')
    expect((await run(readEntry('supposed-once'))).entry.sources).toMatchObject([
      { said_by: 'owner' },
      { slug: 'ada-lind' },
    ])
  })

  test('a person named still overrides the owner entry', async () => {
    await run(
      writeEntry({
        type: 'remark',
        title: 'Supposed thrice',
        fields: { text: 'Serviced in winter.' },
        provenance: { text: 'inferred' },
      }),
    )
    const confirmed = await run(asOwner(confirmValue('supposed-thrice', 'text', 'samir-haddad')))
    expect(confirmed.sources).toMatchObject([{ slug: 'samir-haddad' }])
  })
})
