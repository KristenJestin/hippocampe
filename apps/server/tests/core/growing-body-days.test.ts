import type { WriteEntryInput } from '@hippocampe/api/model'
import { beforeAll, describe, expect, test } from 'vitest'
import { execute } from '../../src/core/database/contention.ts'
import { GROWING_BODY, growingBodyNotice, writeEntry } from '../../src/core/entries/index.ts'
import { defineType } from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

beforeAll(() =>
  run(defineType({ name: 'thing', label: 'Thing', description: 'A thing.', fields: [] })),
)

/** Every event of the entry a day earlier: what was written so far was written the day before. */
const aDayPasses = (slug: string) =>
  run(
    execute(
      `UPDATE events SET at = at - interval '1 day'
        WHERE entry_id = (SELECT id FROM entries WHERE slug = $1)`,
      slug,
    ),
  )

/** A part added to the body of an entry, and what the answer of `write` would notice of it. */
const part = async (slug: string, text: string, end: 'append' | 'prepend') => {
  const input: WriteEntryInput = {
    entry: slug,
    body: text,
    [end]: true,
    provenance: { body: 'inferred' },
  }
  return run(growingBodyNotice(await run(writeEntry(input)), input))
}

describe('a body grown at an end on several days is noticed', () => {
  test('a series of prepends to one entry, on three days, gets the notice on the third', async () => {
    await run(
      writeEntry({
        type: 'thing',
        title: 'Workshop log',
        body: 'First day.',
        provenance: { body: 'inferred' },
      }),
    )
    await aDayPasses('workshop-log')
    expect(await part('workshop-log', 'Second day.', 'prepend')).toBeUndefined()
    await aDayPasses('workshop-log')
    expect(await part('workshop-log', 'Third day.', 'prepend')).toBeUndefined()
    await aDayPasses('workshop-log')
    const third = await part('workshop-log', 'Fourth day.', 'prepend')
    expect(third).toContain(GROWING_BODY)
    expect(third).toContain('3 days')
  })

  test('a series of appends to one entry, on three days, gets the notice too', async () => {
    await run(
      writeEntry({
        type: 'thing',
        title: 'Garden readings',
        body: 'Monday: dry.',
        provenance: { body: 'inferred' },
      }),
    )
    await part('garden-readings', '\n\nTuesday: rain.', 'append')
    await aDayPasses('garden-readings')
    await part('garden-readings', '\n\nWednesday: dry.', 'append')
    await aDayPasses('garden-readings')
    expect(await part('garden-readings', '\n\nThursday: wind.', 'append')).toContain(GROWING_BODY)
  })

  test('parts added on one day only, or a body rewritten on other days, get none', async () => {
    await run(
      writeEntry({
        type: 'thing',
        title: 'Shed plan',
        body: 'Paint it green.',
        provenance: { body: 'inferred' },
      }),
    )
    await aDayPasses('shed-plan')
    await run(
      writeEntry({ entry: 'shed-plan', body: 'Paint it blue.', provenance: { body: 'inferred' } }),
    )
    await aDayPasses('shed-plan')
    expect(await part('shed-plan', ' Then oil the hinges.', 'append')).toBeUndefined()
    expect(await part('shed-plan', ' Then fix the lock.', 'append')).toBeUndefined()
  })
})

describe('dated sections appended to a body that grew on earlier days are noticed', () => {
  test('on the third day of growth the notice says to write an entry of a dated type under the subject', async () => {
    await run(
      writeEntry({
        type: 'thing',
        title: 'Roof repairs',
        body: '## 2026-10-08\n\nChecked the ridge.\n',
        provenance: { body: 'inferred' },
      }),
    )
    // The day it was created is not a day it grew: the first part added comes after it.
    await aDayPasses('roof-repairs')
    expect(
      await part('roof-repairs', '\n## 2026-10-09\n\nReplaced two tiles.\n', 'append'),
    ).toBeUndefined()
    await aDayPasses('roof-repairs')
    expect(
      await part('roof-repairs', '\n## 2026-10-10\n\nSealed the gutter.\n', 'append'),
    ).toBeUndefined()
    await aDayPasses('roof-repairs')
    const third = await part('roof-repairs', '\n## 2026-10-11\n\nPainted the sill.\n', 'append')
    expect(third).toContain('3 days')
    expect(third).toContain(GROWING_BODY)
    expect(GROWING_BODY).toContain('of a dated type')
    expect(GROWING_BODY).toContain('part of what it is about (`parent`)')
  })
})
