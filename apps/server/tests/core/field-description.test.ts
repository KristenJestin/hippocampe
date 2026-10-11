import { Effect } from 'effect'
import { describe, expect, test } from 'vitest'
import { readEntry, writeEntry } from '../../src/core/entries/index.ts'

import { typeHistory } from '../../src/core/events/index.ts'
import { markdownFiles } from '../../src/core/export/index.ts'
import { Refused } from '../../src/core/refused.ts'
import {
  addFields,
  changeField,
  defineType,
  getType,
  listTypes,
} from '../../src/core/types/index.ts'
import { useScratchDatabase } from './scratch-database.ts'

const run = useScratchDatabase()

/** The sentence a refused effect fails with. */
const refusalOf = <A, E, R>(effect: Effect.Effect<A, E | Refused, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => (error instanceof Refused ? error.message : `not a refusal: ${error}`)),
  )

const SPOTTED = 'A few words: why the person is kept, such as "designer spotted".'

describe('a type is defined with a field that says what it holds', () => {
  test('define_type keeps the description of a field and types returns it', async () => {
    await run(
      defineType({
        name: 'person',
        label: 'Person',
        description: 'Someone the owner knows or keeps in mind.',
        fields: [
          { name: 'relation', kind: 'text', required: true, description: SPOTTED },
          { name: 'nickname', kind: 'text' },
        ],
      }),
    )
    const expected = [
      { name: 'relation', kind: 'text', required: true, description: SPOTTED },
      { name: 'nickname', kind: 'text' },
    ]
    expect((await run(getType('person'))).fields).toEqual(expected)
    expect((await run(listTypes)).find(({ name }) => name === 'person')?.fields).toEqual(expected)
  })

  test('the Markdown export of the type writes it', async () => {
    const files = await run(markdownFiles)
    const file = files.find(({ path }) => path === '_types/person.md')
    expect(file?.content).toContain(SPOTTED)
  })
})

describe('a field added to an existing type carries its description', () => {
  test('addFields keeps it, and the event of the type holds it', async () => {
    await run(
      defineType({
        name: 'tool',
        label: 'Tool',
        description: 'A tool in the workshop.',
        fields: [],
      }),
    )
    await run(
      addFields('tool', [
        { name: 'shelf', kind: 'text', description: 'Where it is kept, a few words.' },
      ]),
    )
    expect((await run(getType('tool'))).fields).toEqual([
      { name: 'shelf', kind: 'text', description: 'Where it is kept, a few words.' },
    ])
    const last = (await run(typeHistory('tool'))).at(-1)
    expect(last?.action).toBe('add_field')
  })
})

describe('the description of an existing field is set, then replaced', () => {
  test('change_type with a field sets it, then replaces it, values unchanged, one event each', async () => {
    await run(
      defineType({
        name: 'contact',
        label: 'Contact',
        description: 'Someone to reach.',
        fields: [{ name: 'role', kind: 'text' }],
      }),
    )
    await run(
      writeEntry({
        type: 'contact',
        title: 'Ada',
        fields: { role: 'plumber' },
        provenance: { role: 'inferred' },
      }),
    )
    const before = (await run(typeHistory('contact'))).length

    const set = await run(changeField({ type: 'contact', field: 'role', description: 'A trade.' }))
    expect(set.type.fields).toEqual([{ name: 'role', kind: 'text', description: 'A trade.' }])
    expect(set.repaired).toEqual([])
    const replaced = await run(
      changeField({ type: 'contact', field: 'role', description: 'Their trade, in a word.' }),
    )
    expect(replaced.type.fields).toEqual([
      { name: 'role', kind: 'text', description: 'Their trade, in a word.' },
    ])

    expect((await run(getType('contact'))).fields).toEqual(replaced.type.fields)
    expect((await run(readEntry('ada'))).entry.fields).toEqual({ role: 'plumber' })
    const history = await run(typeHistory('contact'))
    expect(history).toHaveLength(before + 2)
    expect(history.at(-2)?.changes).toEqual([
      {
        field: 'fields.role',
        before: { name: 'role', kind: 'text' },
        after: { name: 'role', kind: 'text', description: 'A trade.' },
      },
    ])
    expect(history.at(-1)?.changes).toEqual([
      {
        field: 'fields.role',
        before: { name: 'role', kind: 'text', description: 'A trade.' },
        after: { name: 'role', kind: 'text', description: 'Their trade, in a word.' },
      },
    ])
  })

  test('another change of the field keeps its description', async () => {
    await run(changeField({ type: 'contact', field: 'role', required: true }))
    expect((await run(getType('contact'))).fields).toEqual([
      { name: 'role', kind: 'text', required: true, description: 'Their trade, in a word.' },
    ])
  })
})

describe('an empty field description is refused, saying what to do', () => {
  test('through change_type and through define_type, nothing changes', async () => {
    expect(
      await run(refusalOf(changeField({ type: 'contact', field: 'role', description: '' }))),
    ).toBe(
      'The field `fields.0.description` must be a short sentence saying what the field holds, not empty text.',
    )
    const defining = await run(
      refusalOf(
        defineType({
          name: 'blank',
          label: 'Blank',
          description: 'A type to try.',
          fields: [{ name: 'x', kind: 'text', description: '' }],
        }),
      ),
    )
    expect(defining).toBe(
      'The field `fields.0.description` must be a short sentence saying what the field holds, not empty text.',
    )
    expect((await run(getType('contact'))).fields[0]?.description).toBe('Their trade, in a word.')
  })

  test('a description too long is refused, saying the maximum', async () => {
    const refusal = await run(
      refusalOf(changeField({ type: 'contact', field: 'role', description: 'a'.repeat(301) })),
    )
    expect(refusal).toContain('300')
  })
})
