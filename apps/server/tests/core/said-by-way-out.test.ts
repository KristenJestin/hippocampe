import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  confirmValue,
  readEntry,
  supposedValues,
  writeEntry,
} from '../../src/core/entries/index.ts'
import { Rights } from '../../src/core/auth/index.ts'
import { Actor } from '../../src/core/events/index.ts'
import { Refused } from '../../src/core/refused.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

/** A write made by the key `agent-desk`, as an agent's session makes it. */
const byAgent = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, Actor, 'agent-desk')

/** What every refusal of a `said_by` that names no entry says to do. */
const WAY_OUT =
  'What was told is cited by who said it: `{ "said_by": "owner", "on": "2026-10-08" }` for what the owner said, or `{ "said_by": "<slug of their entry>", "on": "2026-10-08" }` for what someone else said, whose entry is created first if there is none; or write the value `inferred` without that source. Never `seen_by`, which is for what this key did or saw itself.'

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
        name: 'remark',
        label: 'Remark',
        description: 'Something said.',
        fields: [{ name: 'text', kind: 'text' }],
      })
    }),
  ),
)

describe('a said_by that names no entry says how to cite what was told', () => {
  test('a said_by naming no entry is refused, naming the way out', async () => {
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Told by nobody',
              sources: [{ said_by: 'nobody', on: '2026-10-08' }],
            }),
          ),
        ),
      ),
    ).toBe(`The source \`sources.0\` names \`nobody\`, which is not an entry. ${WAY_OUT}`)
  })

  test('a said_by naming the key of the writer is refused with the same sentence, naming the mistake', async () => {
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Told by the key',
              sources: [{ said_by: 'agent-desk', on: '2026-10-08' }],
            }),
          ),
        ),
      ),
    ).toBe(
      `The source \`sources.0\` names \`agent-desk\`, the name of a key, not of an entry. ${WAY_OUT}`,
    )
  })

  test('a said_by without a day is told plainly, not as a mismatch', async () => {
    await run(writeEntry({ type: 'person', title: 'Marie Lund' }))
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Told on no day',
              // SAFETY: the shape a careless agent sends; the write is what must refuse it.
              sources: [{ said_by: 'marie-lund' } as never],
            }),
          ),
        ),
      ),
    ).toBe('The source `sources.0` needs `on`, the day it was said, such as `2026-10-08`.')
  })

  test('the value inferred, without a source, is the way out for what nobody can be cited for', async () => {
    await run(
      byAgent(
        writeEntry({
          type: 'remark',
          title: 'Supposed',
          fields: { text: 'The boiler was serviced.' },
          provenance: { text: 'inferred' },
        }),
      ),
    )
    expect((await run(readEntry('supposed'))).entry.provenance.text).toBe('inferred')
  })

  test('the entry of someone else, created first, is the way out for what they said', async () => {
    await run(writeEntry({ type: 'person', title: 'Samir Haddad' }))
    const told = await run(
      byAgent(
        writeEntry({
          type: 'remark',
          title: 'Told by Samir',
          fields: { text: 'The boiler was serviced.' },
          provenance: { text: 'extracted' },
          sources: [{ said_by: 'samir-haddad', on: '2026-10-08' }],
        }),
      ),
    )
    expect(told.sources).toMatchObject([{ slug: 'samir-haddad', on: '2026-10-08' }])
  })
})

describe('what the owner said is cited as said by the owner, with no entry', () => {
  const byOwner = (title: string, note = 'in the kitchen') =>
    writeEntry({
      type: 'remark',
      title,
      fields: { text: 'The boiler was serviced.' },
      provenance: { text: 'extracted' },
      sources: [{ said_by: 'owner', on: '2026-10-08', note }],
    })

  test('a source said by owner is accepted with no entry for the owner, and read back as said by owner', async () => {
    const written = await run(byAgent(byOwner('Told by the owner')))
    const expected = [{ said_by: 'owner', on: '2026-10-08', note: 'in the kitchen' }]
    expect(written.sources).toEqual(expected)
    expect((await run(readEntry('told-by-the-owner'))).entry.sources).toEqual(expected)
  })

  test('the value it backs is known: it is absent from what is only supposed', async () => {
    await run(byAgent(byOwner('Known from the owner')))
    expect(
      (await run(supposedValues({}))).filter(({ slug }) => slug === 'known-from-the-owner'),
    ).toEqual([])
  })

  test('a source said by owner without a day is told plainly', async () => {
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Owner, no day',
              // SAFETY: the shape a careless agent sends; the write is what must refuse it.
              sources: [{ said_by: 'owner' } as never],
            }),
          ),
        ),
      ),
    ).toBe('The source `sources.0` needs `on`, the day it was said, such as `2026-10-08`.')
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Owner, a word for a day',
              sources: [{ said_by: 'owner', on: 'yesterday' }],
            }),
          ),
        ),
      ),
    ).toBe(
      'The source `sources.0` needs `on`, the day it was said, such as `2026-10-08`: `yesterday` is not a date.',
    )
  })

  test('another key writing the sources back as read keeps the source said by owner', async () => {
    await run(byAgent(byOwner('Read and written back')))
    const read = (await run(readEntry('read-and-written-back'))).entry.sources
    const written = await run(
      Effect.provideService(
        writeEntry({
          entry: 'read-and-written-back',
          sources: [...read, { url: 'https://example.org/boilers' }],
        }),
        Actor,
        'agent-phone',
      ),
    )
    expect(written.sources).toEqual([
      { said_by: 'owner', on: '2026-10-08', note: 'in the kitchen' },
      { url: 'https://example.org/boilers' },
    ])
  })

  test('a key without the right to see sensitive entries reads it as it is, not as hidden', async () => {
    await run(byAgent(byOwner('Read without the right')))
    const read = await run(
      Effect.provideService(readEntry('read-without-the-right'), Rights, ['read']),
    )
    expect(read.entry.sources).toEqual([
      { said_by: 'owner', on: '2026-10-08', note: 'in the kitchen' },
    ])
  })

  test("the command line confirming as a person writes that person's entry, beside a source said by owner", async () => {
    await run(writeEntry({ type: 'person', title: 'Marie Lund' }))
    await run(
      byAgent(
        writeEntry({
          type: 'remark',
          title: 'Suspected then confirmed',
          fields: { text: 'It was Marie.' },
          provenance: { text: 'inferred' },
          sources: [{ said_by: 'owner', on: '2026-10-07' }],
        }),
      ),
    )
    const confirmed = await run(
      Effect.provideService(
        Effect.provideService(
          confirmValue('suspected-then-confirmed', 'text', 'marie-lund'),
          Rights,
          ['read', 'write', 'sensitive', 'owner'],
        ),
        Actor,
        'owner',
      ),
    )
    expect(confirmed.provenance).toEqual({ text: 'extracted' })
    expect(confirmed.sources).toMatchObject([
      { said_by: 'owner', on: '2026-10-07' },
      { slug: 'marie-lund', title: 'Marie Lund' },
    ])
  })

  test('an entry whose slug is owner is cited by its id: owner always means the owner', async () => {
    const entry = await run(writeEntry({ type: 'person', title: 'Owner' }))
    expect(entry.slug).toBe('owner')
    const told = await run(
      byAgent(
        writeEntry({
          type: 'remark',
          title: 'Told by the person called owner',
          fields: { text: 'The boiler was serviced.' },
          provenance: { text: 'extracted' },
          sources: [
            { said_by: 'owner', on: '2026-10-08' },
            { said_by: entry.id, on: '2026-10-08' },
          ],
        }),
      ),
    )
    expect(told.sources).toMatchObject([
      { said_by: 'owner', on: '2026-10-08' },
      { said_by: entry.id, slug: 'owner', title: 'Owner', on: '2026-10-08' },
    ])
    // Only the second citation is the entry's.
    expect((await run(readEntry('owner'))).cited_by).toEqual([
      {
        id: told.id,
        slug: 'told-by-the-person-called-owner',
        title: 'Told by the person called owner',
      },
    ])
  })
})
