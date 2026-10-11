import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'
import { Effect, ManagedRuntime } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startServer } from './stdio-client.ts'

const database = ManagedRuntime.make(scratchDatabase)
let url = ''

/** A session starting now, as an agent whose key has `read` and `write`, not `owner`. */
const session = () =>
  startServer({
    DATABASE_URL: url,
    HIPPOCAMPE_ACTOR: 'agent-test',
    HIPPOCAMPE_RIGHTS: 'read,write',
  })

beforeAll(async () => {
  url = await database.runPromise(
    Effect.gen(function* () {
      return (yield* ScratchDatabase).url
    }),
  )
})

afterAll(() => database.dispose())

describe('a type is defined with a field that says what it holds', () => {
  test('define_type takes the description of a field, add fields takes it, types returns both', async () => {
    const server = await session()
    await server.call('define_type', {
      name: 'person',
      label: 'Person',
      description: 'Someone the owner knows.',
      fields: [
        { name: 'relation', kind: 'text', description: 'Why we know them, in a few words.' },
      ],
    })
    await server.call('define_type', {
      name: 'person',
      fields: [{ name: 'city', kind: 'text', description: 'Where they live.' }],
    })
    expect(await server.call('types', { name: 'person' })).toMatchObject({
      result: {
        type: {
          fields: [
            { name: 'relation', description: 'Why we know them, in a few words.' },
            { name: 'city', description: 'Where they live.' },
          ],
        },
      },
    })
    server.close()
  })
})

describe('the description of an existing field is set, then replaced', () => {
  test('change_type with a field, from the tool, leaves the type description alone', async () => {
    const server = await session()
    expect(
      await server.call('change_type', {
        type: 'person',
        field: 'city',
        description: 'Their town.',
      }),
    ).toMatchObject({
      result: { type: { description: 'Someone the owner knows.' } },
    })
    expect(
      await server.call('change_type', {
        type: 'person',
        field: 'city',
        description: 'The town they live in.',
      }),
    ).toMatchObject({
      result: {
        type: {
          fields: [{ name: 'relation' }, { name: 'city', description: 'The town they live in.' }],
        },
      },
    })
    server.close()
  })
})

describe('an empty field description is refused, saying what to do', () => {
  test('through MCP, with the field it names', async () => {
    const server = await session()
    expect(
      await server.call('change_type', { type: 'person', field: 'city', description: '' }),
    ).toEqual({
      error: 'The field `description` must be text that is not empty.',
    })
    server.close()
  })
})
