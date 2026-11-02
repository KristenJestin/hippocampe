import type { ToolInputSchema } from '@hippocampe/api/schema'
import { Option, Schema } from 'effect'
import { describe, expect, test } from 'vitest'
import { DIAGNOSTICS_TOOLS, TOOLS } from '../../src/mcp/tools.ts'
import { readTool } from '../../src/mcp/tools/read.ts'

/** A JSON Schema as a tree of plain objects and lists, to walk. */
const JsonSchemaNode = Schema.Record(Schema.String, Schema.Json)

/** Every schema nested in a JSON Schema, itself included, under any keyword. */
function nested(schema: Schema.Json): ReadonlyArray<Readonly<Record<string, Schema.Json>>> {
  if (Array.isArray(schema)) return schema.flatMap(nested)
  return Option.match(Schema.decodeUnknownOption(JsonSchemaNode)(schema), {
    onNone: () => [],
    onSome: (node) => [node, ...Object.values(node).flatMap(nested)],
  })
}

/** An object schema: its properties by name. */
const Properties = Schema.Struct({ properties: Schema.Record(Schema.String, Schema.Json) })

/** Whether a property says what it is: a description of its own, or of every way it may be. */
const hasDescription = (property: Schema.Json): boolean =>
  Option.match(
    Schema.decodeUnknownOption(
      Schema.Struct({
        description: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
      }),
    )(property),
    { onNone: () => false, onSome: ({ description }) => description !== undefined },
  )

/** The input schema of a tool as plain JSON, the way a client receives it. */
const jsonOf = (tool: { readonly inputSchema: ToolInputSchema }) =>
  Schema.decodeUnknownSync(Schema.Json)(tool.inputSchema)

const schemas = [...TOOLS, ...DIAGNOSTICS_TOOLS].map((tool) => ({
  name: tool.name,
  schema: jsonOf(tool),
}))

describe('input schemas tell the truth about unknown keys', () => {
  test('every object a tool describes says additionalProperties: false', () => {
    const open = schemas.flatMap(({ name, schema }) =>
      nested(schema)
        .filter((node) => 'properties' in node && node['additionalProperties'] !== false)
        .map(() => name),
    )
    expect([...new Set(open)]).toEqual([])
  })

  test('read.limit, the page of the history, is an integer, not a number that admits Infinity', () => {
    const { properties } = Schema.decodeUnknownSync(
      Schema.Struct({ properties: Schema.Record(Schema.String, Schema.Json) }),
    )(jsonOf(readTool))
    expect(properties['limit']).toMatchObject({ type: 'integer' })
    expect(JSON.stringify(properties['limit'])).not.toContain('Infinity')
  })
})

/** What a `$ref` of the document points to, following the JSON pointer inside it. */
const resolved = (document: Schema.Json, property: Schema.Json): Schema.Json => {
  const { $ref } = Schema.decodeUnknownSync(
    Schema.Struct({ $ref: Schema.optionalKey(Schema.String) }),
  )(property)
  if ($ref === undefined) return property
  return $ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<Schema.Json>(
      (node, key) =>
        Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(node)[key] ?? null,
      document,
    )
}

describe('every parameter of every tool is described', () => {
  test('a property without a description fails, at any depth, once its reference is followed', () => {
    const bare = schemas.flatMap(({ name, schema }) =>
      nested(schema).flatMap((node) =>
        Option.match(Schema.decodeUnknownOption(Properties)(node), {
          onNone: () => [],
          onSome: ({ properties }) =>
            Object.entries(properties)
              .filter(([, property]) => !hasDescription(resolved(schema, property)))
              .map(([property]) => `${name}.${property}`),
        }),
      ),
    )
    expect([...new Set(bare)].toSorted()).toEqual([])
  })
})

/** Whether a root property says its type itself: a `type`, or every member of an `anyOf`/`oneOf` does. */
const saysItsType = (property: Schema.Json): boolean =>
  Option.match(
    Schema.decodeUnknownOption(
      Schema.Struct({
        type: Schema.optionalKey(Schema.String),
        anyOf: Schema.optionalKey(Schema.Array(Schema.Json)),
        oneOf: Schema.optionalKey(Schema.Array(Schema.Json)),
      }),
    )(property),
    {
      onNone: () => false,
      onSome: ({ type, anyOf, oneOf }) =>
        type !== undefined ||
        [anyOf, oneOf].some(
          (members) => members !== undefined && members.length > 0 && members.every(saysItsType),
        ),
    },
  )

/** Keys that take any JSON value, so name no type: they are not references, and say so. */
const ANY_VALUE = ['change_type.default']

describe('every root key of a tool input says its type', () => {
  test('no root property of any tool is a bare reference: a client that does not resolve $ref sends its JSON as a string', () => {
    const untyped = schemas.flatMap(({ name, schema }) =>
      Option.match(Schema.decodeUnknownOption(Properties)(schema), {
        onNone: () => [],
        onSome: ({ properties }) =>
          Object.entries(properties)
            .map(([property, node]) => ({ key: `${name}.${property}`, node }))
            .filter(({ key, node }) => !saysItsType(node) && !ANY_VALUE.includes(key))
            .map(({ key }) => key),
      }),
    )
    expect(untyped.toSorted()).toEqual([])
  })
})

describe('the items of entries are described once', () => {
  const write = schemas.find(({ name }) => name === 'write')?.schema ?? null
  const { properties, $defs } = Schema.decodeUnknownSync(
    Schema.Struct({
      properties: Schema.Record(Schema.String, Schema.Json),
      $defs: Schema.Record(Schema.String, Schema.Json),
    }),
  )(write)

  test('write: entries.items refers to $defs.WriteEntry, which holds the item', () => {
    expect(properties['entries']).toMatchObject({
      type: 'array',
      items: { $ref: '#/$defs/WriteEntry' },
    })
    expect($defs['WriteEntry']).toMatchObject({
      type: 'object',
      properties: { entry: { type: 'string' }, provenance: { type: 'object' } },
    })
  })

  test('write: the keys of one entry stay at the root, in full, beside entries', () => {
    expect(properties['edits']).toMatchObject({ type: 'array' })
    expect(properties['prepend']).toMatchObject({ type: 'boolean' })
    expect(properties['provenance']).toMatchObject({ type: 'object' })
    expect(properties['sources']).toMatchObject({ type: 'array' })
  })

  test('no tool carries the same schema of more than 300 characters twice outside its $defs', () => {
    const twice = schemas.flatMap(({ name, schema }) => {
      const { $defs: _definitions, ...root } = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Json),
      )(schema)
      const seen = new Map<string, number>()
      for (const node of nested(root)) {
        const text = JSON.stringify(node)
        if (text.length > 300) seen.set(text, (seen.get(text) ?? 0) + 1)
      }
      return [...seen.values()].some((count) => count > 1) ? [name] : []
    })
    expect(twice).toEqual([])
  })
})
