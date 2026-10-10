import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { readEntry, writeEntry } from '../../src/core/entries/index.ts'
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
  'What was told is cited by the entry of the person who said it (`{ "said_by": "<slug of their entry>", "on": "2026-10-08" }`): create that entry first, a person the owner is or someone else, or write the value `inferred` without that source; never `seen_by`, which is for what this key did or saw itself.'

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

  test('a said_by naming owner, when no entry has that name, is refused with the same sentence', async () => {
    expect(
      await run(
        byAgent(
          refusalOf(
            writeEntry({
              type: 'remark',
              title: 'Told by the owner',
              sources: [{ said_by: 'owner', on: '2026-10-08' }],
            }),
          ),
        ),
      ),
    ).toBe(
      `The source \`sources.0\` names \`owner\`, the name of a key, not of an entry. ${WAY_OUT}`,
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

  test('the entry of a person the owner is, or the value inferred, is the way out', async () => {
    await run(writeEntry({ type: 'person', title: 'Owner' }))
    const told = await run(
      byAgent(
        writeEntry({
          type: 'remark',
          title: 'Told by the owner entry',
          fields: { text: 'The boiler was serviced.' },
          provenance: { text: 'extracted' },
          sources: [{ said_by: 'owner', on: '2026-10-08' }],
        }),
      ),
    )
    expect(told.sources).toMatchObject([{ said_by: expect.any(String), on: '2026-10-08' }])
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
})
