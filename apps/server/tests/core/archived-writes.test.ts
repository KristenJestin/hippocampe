import { Effect } from 'effect'
import { beforeAll, describe, expect, test } from 'vitest'
import { archiveEntry, readEntry, writeEntry } from '../../src/core/entries/index.ts'
import { Refused } from '../../src/core/refused.ts'
import { defineType } from '../../src/core/types/index.ts'
import { readTool } from '../../src/mcp/tools/read.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

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

/** An entry archived with a reason, and the day it was archived. */
const archived = async (title: string, reason = 'Replaced by dated entries.') => {
  const written = await run(
    writeEntry({
      type: 'thing',
      title,
      summary: 'A thing.',
      body: '## Notes\n\nFirst line.\n',
      fields: { size: 'small' },
      provenance: { size: 'inferred', body: 'inferred', summary: 'inferred' },
    }),
  )
  const { archived_at } = await run(archiveEntry(written.slug, reason))
  return { slug: written.slug, day: String(archived_at).slice(0, 10) }
}

/** What a write to an archived entry is told when the entry has no successor. */
const REFUSED = (slug: string, day: string, reason: string) =>
  `The entry \`${slug}\` was archived on ${day} ("${reason}"), so it is no longer written to: what is added there is read by no one. Write what you have in an entry of its own, part of the same subject (\`parent\`), or of a dated type if it happened at a time. If this entry is really to come back, tell the owner: \`write\` cannot unarchive it, they do it with \`hippo entry:unarchive ${slug}\`. If another entry replaces it, name it in \`superseded_by\` before archiving: an archived entry takes no write, that one included.`

describe('a write to an archived entry is refused, saying the archive', () => {
  const reason = 'Replaced by dated entries.'
  const writes = {
    body: { body: 'A new body.\n', provenance: { body: 'inferred' } },
    append: { body: '## Later\n\nMore.\n', append: true, provenance: { body: 'inferred' } },
    prepend: { body: '## Before\n\nLess.\n', prepend: true, provenance: { body: 'inferred' } },
    edits: { edits: [{ find: 'First', replace: 'Second' }], provenance: { body: 'inferred' } },
    summary: { summary: 'Another summary.', provenance: { summary: 'inferred' } },
    field: { fields: { size: 'large' }, provenance: { size: 'inferred' } },
    title: { title: 'Another title' },
  } as const
  for (const [what, write] of Object.entries(writes)) {
    test(`the ${what} of an archived entry is refused with the date and the reason of the archive`, async () => {
      const { slug, day } = await archived(`Archived ${what}`, reason)
      const before = await run(readEntry(slug))
      expect(await run(refusalOf(writeEntry({ entry: slug, ...write })))).toBe(
        REFUSED(slug, day, reason),
      )
      expect(await run(readEntry(slug))).toEqual(before)
    })
  }

  test('an archive without a reason is refused all the same, without a reason to say', async () => {
    const written = await run(writeEntry({ type: 'thing', title: 'Archived without reason' }))
    const { archived_at } = await run(archiveEntry(written.slug))
    const day = String(archived_at).slice(0, 10)
    expect(await run(refusalOf(writeEntry({ entry: written.slug, title: 'Late' })))).toBe(
      `The entry \`${written.slug}\` was archived on ${day}, so it is no longer written to: what is added there is read by no one. Write what you have in an entry of its own, part of the same subject (\`parent\`), or of a dated type if it happened at a time. If this entry is really to come back, tell the owner: \`write\` cannot unarchive it, they do it with \`hippo entry:unarchive ${written.slug}\`. If another entry replaces it, name it in \`superseded_by\` before archiving: an archived entry takes no write, that one included.`,
    )
  })

  test('an entry superseded by another names it: write there instead', async () => {
    await run(writeEntry({ type: 'thing', title: 'Current notes' }))
    const old = await run(
      writeEntry({ type: 'thing', title: 'Old notes', superseded_by: 'current-notes' }),
    )
    const { archived_at } = await run(archiveEntry(old.slug, 'Replaced.'))
    expect(await run(refusalOf(writeEntry({ entry: old.slug, title: 'Late' })))).toBe(
      `The entry \`${old.slug}\` was archived on ${String(archived_at).slice(0, 10)} ("Replaced."), so it is no longer written to: what is added there is read by no one. It is superseded by \`current-notes\`: write there instead.`,
    )
  })

  test('the refusal comes with the other problems of the write, in one sentence', async () => {
    const { slug, day } = await archived('Archived and wrong')
    expect(
      await run(
        refusalOf(
          writeEntry({
            entry: slug,
            body: 'x',
            append: true,
            prepend: true,
            provenance: { body: 'inferred' },
          }),
        ),
      ),
    ).toBe(
      `Give \`append\` or \`prepend\`, not both: one write each. ${REFUSED(slug, day, 'Replaced by dated entries.')}`,
    )
  })

  test('archiving again with a new reason still works', async () => {
    const { slug } = await archived('Archived twice')
    const again = await run(archiveEntry(slug, 'Replaced by the shed.'))
    expect(again.archived_reason).toBe('Replaced by the shed.')
  })

  test('a write to an entry that is not archived is not refused', async () => {
    const written = await run(
      writeEntry({
        type: 'thing',
        title: 'Still alive',
        summary: 'Ok.',
        provenance: { summary: 'inferred' },
      }),
    )
    expect(
      (
        await run(
          writeEntry({
            entry: written.slug,
            summary: 'Still ok.',
            provenance: { summary: 'inferred' },
          }),
        )
      ).summary,
    ).toBe('Still ok.')
  })
})

describe('a read of an archived entry says the archive, however it is cut', () => {
  const reason = 'Replaced by dated entries.'

  test('the headings of an archived entry come with archived_at and archived_reason', async () => {
    const { slug } = await archived('Archived headings', reason)
    const stored = await run(readEntry(slug))
    expect(await run(readTool.run({ entry: slug, headings: true }))).toEqual({
      headings: [{ level: 2, text: 'Notes' }],
      archived_at: stored.entry.archived_at,
      archived_reason: reason,
    })
  })

  test('a section of an archived entry comes with archived_at and archived_reason', async () => {
    const { slug } = await archived('Archived section', reason)
    const stored = await run(readEntry(slug))
    expect(await run(readTool.run({ entry: slug, section: 'Notes' }))).toEqual({
      section: '## Notes\n\nFirst line.',
      archived_at: stored.entry.archived_at,
      archived_reason: reason,
    })
  })

  test('the headings and the section of an entry that is not archived carry no archive', async () => {
    const written = await run(
      writeEntry({
        type: 'thing',
        title: 'Plain headings',
        body: '## Notes\n\nFirst line.\n',
        provenance: { body: 'inferred' },
      }),
    )
    expect(await run(readTool.run({ entry: written.slug, headings: true }))).toEqual({
      headings: [{ level: 2, text: 'Notes' }],
    })
    expect(await run(readTool.run({ entry: written.slug, section: 'Notes' }))).toEqual({
      section: '## Notes\n\nFirst line.',
    })
  })
})
