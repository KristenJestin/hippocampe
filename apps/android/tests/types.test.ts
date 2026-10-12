import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { generate, TYPES } from '../scripts/types.ts'

describe('the Kotlin types of the API', () => {
  test('the generated types follow the OpenAPI document', () => {
    expect(
      readFileSync(TYPES, 'utf8') === generate(),
      `${TYPES} is out of date: run \`bun run generate\``,
    ).toBe(true)
  })

  test('a schema becomes a serializable class, its enums and nullable values kept', () => {
    const kotlin = generate()
    expect(kotlin).toContain('data class InboxSent(')
    expect(kotlin).toContain('    @SerialName("client_id")\n    val clientId: String?,')
    expect(kotlin).toContain('enum class InboxSentStatus {')
    expect(kotlin).toContain('    @SerialName("dismissed")\n    Dismissed,')
    expect(kotlin).toContain('    val note: String? = null,')
  })
})
