import { Schema } from 'effect'
import type { JsonSchema } from 'effect'

/** The JSON Schema an MCP tool declares for its input. */
export interface ToolInputSchema extends JsonSchema.JsonSchema {
  readonly type: 'object'
  readonly $defs?: JsonSchema.Definitions
}

/**
 * A tool that takes one thing or a list of it (`write`: an entry, or `entries`) restates the item
 * in its own keys. `property` names the array whose items are that thing; `as` names its definition.
 */
export interface Sharing {
  readonly property: string
  readonly as: string
}

const Node = Schema.Record(Schema.String, Schema.Json)
const Properties = Schema.Struct({ properties: Node })
const Listed = Schema.Struct({ items: Node })

/**
 * Describes the item of `sharing.property` once, under `$defs`: the items of the list refer to
 * the definition. The keys of the root are written out in full, each with its own type, though
 * they restate the properties of the item: a client that does not resolve references when it
 * builds the arguments (Claude Code does not) cannot tell a bare `$ref` is an object, a list or a
 * boolean, and sends its JSON as a string. The descriptions of the item therefore appear twice.
 */
function sharedOnce(input: ToolInputSchema, { property, as }: Sharing): ToolInputSchema {
  const root = Schema.decodeUnknownSync(Properties)(input)
  const list = Schema.decodeUnknownSync(Node)(root.properties[property])
  const items = Schema.decodeUnknownSync(Node)(Schema.decodeUnknownSync(Listed)(list).items)
  return {
    ...input,
    properties: { ...root.properties, [property]: { ...list, items: { $ref: `#/$defs/${as}` } } },
    $defs: { ...input.$defs, [as]: items },
  }
}

/**
 * The input schema of an MCP tool, generated from the Effect schema the tool decodes with. Every
 * Hippocampe MCP tool takes its input schema from here and from nowhere else.
 *
 * A tool refuses a key its schema does not name, so every object says `additionalProperties:
 * false`. Everything is inlined, since an agent, or the client that builds its arguments, reads the
 * schema rather than resolving references; only a recursive schema keeps references, and so does
 * the list item of a tool that restates it (`sharing`), to a definition carried in the same
 * document: no key of the root is ever a bare reference.
 */
export function toToolInputSchema(schema: Schema.Top, sharing?: Sharing): ToolInputSchema {
  const document = Schema.toJsonSchemaDocument(schema, {
    referencePolicy: () => undefined,
    onExcessProperty: 'error',
  })
  const root = document.schema
  if (root.type !== 'object') {
    throw new Error('An MCP tool input must be a JSON object at the root: decode it with a Struct.')
  }
  const input: ToolInputSchema = { ...root, type: 'object' }
  const defined =
    Object.keys(document.definitions).length === 0
      ? input
      : { ...input, $defs: document.definitions }
  return sharing === undefined ? defined : sharedOnce(defined, sharing)
}
