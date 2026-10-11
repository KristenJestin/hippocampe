import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { Rights } from '../../src/core/auth/index.ts'
import type { Right } from '../../src/core/auth/index.ts'
import {
  archiveEntry,
  readEntry,
  unarchiveEntry,
  writeEntry,
} from '../../src/core/entries/index.ts'
import { Actor, entryHistory } from '../../src/core/events/index.ts'
import { Refused } from '../../src/core/refused.ts'
import { defineType } from '../../src/core/types/index.ts'
import { writeTool } from '../../src/mcp/tools/write.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

/** What a key with these rights does, as the actor `owner` or as the key `agent-desk`. */
const asKey =
  (actor: string, rights: ReadonlyArray<Right>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(Effect.provideService(effect, Rights, rights), Actor, actor)

const asOwner = asKey('owner', ['read', 'write', 'sensitive', 'owner'])
const byAgent = asKey('agent-desk', ['read', 'write'])

beforeAll(() =>
  run(
    defineType({
      name: 'thing',
      label: 'Thing',
      description: 'A thing.',
      fields: [{ name: 'size', kind: 'text' }],
    }),
  ),
)

/** An entry archived with a reason, written by an agent. */
const archived = async (title: string, reason = 'Replaced by dated entries.') => {
  const written = await run(
    byAgent(
      writeEntry({
        type: 'thing',
        title,
        summary: 'A thing.',
        provenance: { summary: 'inferred' },
      }),
    ),
  )
  const { archived_at } = await run(byAgent(archiveEntry(written.slug, reason)))
  return { slug: written.slug, day: String(archived_at).slice(0, 10) }
}

describe('the owner brings an archived entry back', () => {
  test('an archived entry is no longer archived, and can be written to again', async () => {
    const { slug, day } = await archived('Back again')
    // What the archive was, for the sentence that says it.
    expect(await run(asOwner(unarchiveEntry(slug)))).toMatchObject({
      slug,
      archived_at: expect.stringContaining(day),
      archived_reason: 'Replaced by dated entries.',
    })
    expect((await run(readEntry(slug))).entry).toMatchObject({
      archived_at: null,
      archived_reason: null,
    })
    await run(
      byAgent(
        writeEntry({
          entry: slug,
          summary: 'Written after its return.',
          provenance: { summary: 'inferred' },
        }),
      ),
    )
    expect((await run(readEntry(slug))).entry.summary).toBe('Written after its return.')
  })

  test('the history holds the return as one event of the archive, by the owner', async () => {
    const { slug, day } = await archived('Back in the history')
    await run(asOwner(unarchiveEntry(slug)))
    const history = await run(entryHistory(slug))
    expect(history.filter(({ action }) => action === 'archive')).toHaveLength(2)
    expect(history.at(-1)).toMatchObject({
      actor: 'owner',
      action: 'archive',
      changes: [
        { field: 'archived_at', before: expect.stringContaining(day), after: null },
        { field: 'archived_reason', before: 'Replaced by dated entries.', after: null },
      ],
    })
  })

  test('an entry that is not archived is refused in one sentence', async () => {
    const written = await run(byAgent(writeEntry({ type: 'thing', title: 'Never archived' })))
    expect(await run(asOwner(refusalOf(unarchiveEntry(written.slug))))).toBe(
      'The entry `never-archived` is not archived: there is nothing to bring back.',
    )
    expect((await run(entryHistory(written.slug))).map(({ action }) => action)).toEqual(['create'])
  })

  test('an entry brought back and then asked again is refused as not archived', async () => {
    const { slug } = await archived('Back only once')
    await run(asOwner(unarchiveEntry(slug)))
    expect(await run(asOwner(refusalOf(unarchiveEntry(slug))))).toBe(
      `The entry \`${slug}\` is not archived: there is nothing to bring back.`,
    )
  })

  test('an entry that does not exist is refused, saying what to fix', async () => {
    expect(await run(asOwner(refusalOf(unarchiveEntry('nobody'))))).toBe(
      'The entry `nobody` does not exist.',
    )
  })

  test('a key without the owner right is refused: it is the owner who decides', async () => {
    const { slug } = await archived('Not for an agent')
    expect(await run(byAgent(refusalOf(unarchiveEntry(slug))))).toBe(
      'Only the owner brings an archived entry back, from the command line (`entry:unarchive`).',
    )
    expect((await run(readEntry(slug))).entry.archived_at).not.toBeNull()
  })
})

describe('the refusal of a write to an archived entry names the way back', () => {
  test('without a successor, it names the command for the owner, and the successor to name before', async () => {
    const { slug, day } = await archived('Refused with the way back')
    expect(await run(byAgent(refusalOf(writeEntry({ entry: slug, title: 'Late' }))))).toBe(
      `The entry \`${slug}\` was archived on ${day} ("Replaced by dated entries."), so it is no longer written to: what is added there is read by no one. Write what you have in an entry of its own, part of the same subject (\`parent\`), or of a dated type if it happened at a time. If this entry is really to come back, tell the owner: \`write\` cannot unarchive it, they do it with \`hippo entry:unarchive ${slug}\`. If another entry replaces it, name it in \`superseded_by\` before archiving: an archived entry takes no write, that one included.`,
    )
  })

  test('with a successor, it is named there and nothing else is added', async () => {
    await run(byAgent(writeEntry({ type: 'thing', title: 'Current notes' })))
    const old = await run(
      byAgent(writeEntry({ type: 'thing', title: 'Old notes', superseded_by: 'current-notes' })),
    )
    await run(byAgent(archiveEntry(old.slug, 'Replaced.')))
    expect(await run(byAgent(refusalOf(writeEntry({ entry: old.slug, title: 'Late' }))))).toContain(
      'It is superseded by `current-notes`: write there instead.',
    )
  })
})

describe('the write tool says when the successor is named', () => {
  test('its description says the successor is named before archiving, in 2,048 characters or less', () => {
    expect(writeTool.description).toContain('before archiving')
    expect(writeTool.description.length).toBeLessThanOrEqual(2048)
  })
})
