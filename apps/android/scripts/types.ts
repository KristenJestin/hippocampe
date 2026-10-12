#!/usr/bin/env bun
/**
 * Writes the Kotlin types of the API, `Types.kt`, from the schemas of the server's OpenAPI document:
 * one `@Serializable` class per schema, an enum per set of values. `bun scripts/types.ts` writes the
 * file; a test fails while it is not what the document gives.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The OpenAPI document of the server, exported from its schemas. */
const DOCUMENT = fileURLToPath(new URL('../../../packages/api/openapi.json', import.meta.url))
/** Where the generated types go. */
export const TYPES = fileURLToPath(
  new URL(
    '../app/src/main/kotlin/io/github/kristenjestin/hippocampe/api/Types.kt',
    import.meta.url,
  ),
)

/** What the generator reads of a JSON Schema. */
interface JsonSchema {
  readonly $ref?: string
  readonly type?: string
  readonly format?: string
  readonly enum?: ReadonlyArray<string>
  readonly description?: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: ReadonlyArray<string>
  readonly additionalProperties?: boolean | JsonSchema
  readonly items?: JsonSchema
  readonly anyOf?: ReadonlyArray<JsonSchema>
}

interface Document {
  readonly components: { readonly schemas: Readonly<Record<string, JsonSchema>> }
}

const KEYWORDS = new Set(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(
    ' ',
  ),
)

const words = (text: string) => text.split(/[^A-Za-z0-9]+/).filter((word) => word !== '')
const pascal = (text: string) =>
  words(text)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join('')
const camel = (text: string) => {
  const name = pascal(text)
  return name.charAt(0).toLowerCase() + name.slice(1)
}
const identifier = (name: string) => {
  const safe = /^[0-9]/.test(name) ? `V${name}` : name
  return KEYWORDS.has(safe) ? `\`${safe}\`` : safe
}

/** A KDoc comment, indented, or nothing. */
const kdoc = (description: string | undefined, indent: string) =>
  description === undefined
    ? ''
    : `${indent}/** ${description.replaceAll('*/', '*&#47;').replaceAll('\n', `\n${indent} * `)} */\n`

/** The declarations of a document, in its order, each followed by the types it nests. */
class Generator {
  readonly declarations: Array<string> = []

  /** The Kotlin type of a schema; a type it needs is declared under `name`. */
  type(schema: JsonSchema, name: string): string {
    if (schema.$ref !== undefined) return schema.$ref.replace('#/components/schemas/', '')
    if (schema.anyOf !== undefined) {
      const present = schema.anyOf.filter((member) => member.type !== 'null')
      const [only] = present
      if (only !== undefined && present.length === 1)
        return `${this.type(only, name)}${present.length < schema.anyOf.length ? '?' : ''}`
      return 'JsonElement'
    }
    if (schema.enum !== undefined) {
      this.enumeration(schema, name)
      return name
    }
    switch (schema.type) {
      case 'string':
        return schema.format === 'binary' ? 'ByteArray' : 'String'
      case 'integer':
        return 'Long'
      case 'number':
        return 'Double'
      case 'boolean':
        return 'Boolean'
      case 'array':
        return `List<${this.type(schema.items ?? {}, `${name}Item`)}>`
      case 'object': {
        if (schema.properties !== undefined) {
          this.structure(schema, name)
          return name
        }
        const values = schema.additionalProperties
        if (values === undefined || values === true || values === false) return 'JsonObject'
        return `Map<String, ${this.type(values, `${name}Value`)}>`
      }
      default:
        return 'JsonElement'
    }
  }

  enumeration(schema: JsonSchema, name: string) {
    const values = (schema.enum ?? [])
      .map((value) => `    @SerialName("${value}")\n    ${identifier(pascal(value))},\n`)
      .join('')
    this.declarations.push(
      `${kdoc(schema.description, '')}@Serializable\nenum class ${name} {\n${values}}\n`,
    )
  }

  structure(schema: JsonSchema, name: string) {
    const at = this.declarations.length
    const required = new Set(schema.required ?? [])
    const properties = Object.entries(schema.properties ?? {}).map(([key, property]) => {
      const kotlin = this.type(property, `${name}${pascal(key)}`)
      const type = required.has(key) ? kotlin : `${kotlin.replace(/\?$/, '')}? = null`
      const serial = camel(key) === key ? '' : `    @SerialName("${key}")\n`
      return `${kdoc(property.description, '    ')}${serial}    val ${identifier(camel(key))}: ${type},\n`
    })
    const body =
      properties.length === 0 ? `class ${name}\n` : `data class ${name}(\n${properties.join('')})\n`
    this.declarations.splice(at, 0, `${kdoc(schema.description, '')}@Serializable\n${body}`)
  }

  /** A schema of `components.schemas`, under its own name. */
  schema(name: string, schema: JsonSchema) {
    if (schema.type === 'object' && schema.properties !== undefined) {
      this.structure(schema, name)
      return
    }
    if (schema.enum !== undefined) {
      this.enumeration(schema, name)
      return
    }
    const members = (schema.anyOf ?? []).map((member) => this.type(member, name)).join(', ')
    const description =
      members === ''
        ? schema.description
        : `One of ${members}, told apart by its keys.${schema.description === undefined ? '' : ` ${schema.description}`}`
    this.declarations.push(
      `${kdoc(description, '')}typealias ${name} = ${this.type(schema, name)}\n`,
    )
  }
}

/** The Kotlin types of every schema in `components.schemas`. */
export const generate = () => {
  // SAFETY: the document is the one `bun run openapi` writes, an OpenAPI 3.1 document whose schemas are JSON Schemas.
  const document = JSON.parse(readFileSync(DOCUMENT, 'utf8')) as Document
  const generator = new Generator()
  for (const [name, schema] of Object.entries(document.components.schemas))
    generator.schema(name, schema)
  return [
    '// Generated by `bun run generate` (apps/android/scripts/types.ts) from packages/api/openapi.json: do not edit.\n',
    'package io.github.kristenjestin.hippocampe.api\n',
    'import kotlinx.serialization.SerialName\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.JsonElement\nimport kotlinx.serialization.json.JsonObject\n',
    ...generator.declarations,
  ].join('\n')
}

if (import.meta.main) writeFileSync(TYPES, generate())
