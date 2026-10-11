import { describe, expect, test } from 'vitest'
import { INBOX_STANDARD } from '../../src/mcp/instructions.ts'
import { DIAGNOSTICS_TOOLS, TOOLS } from '../../src/mcp/tools.ts'
import { defineTypeTool } from '../../src/mcp/tools/define-type.ts'
import { inboxTakeTool } from '../../src/mcp/tools/inbox.ts'

/** Claude Code cuts each tool description at this many characters. */
const LIMIT = 2048

describe('no tool description is cut by a client', () => {
  test('no description of a tool is longer than 2,048 characters', () => {
    const tooLong = [...TOOLS, ...DIAGNOSTICS_TOOLS]
      .filter(({ description }) => description.length > LIMIT)
      .map(({ name, description }) => `${name}: ${description.length}`)
    expect(tooLong).toEqual([])
  })

  test('inbox_take refers to the inbox standard of the instructions instead of repeating it', () => {
    expect(inboxTakeTool.description).not.toContain(INBOX_STANDARD)
    expect(inboxTakeTool.description).toContain('How an inbox item becomes entries')
    expect(INBOX_STANDARD.startsWith('How an inbox item becomes entries')).toBe(true)
  })

  test('an agent with no fitting type defines the one it needs, and its description says when to use it', () => {
    expect(defineTypeTool.description).toContain('Define the type you need when none fits')
    expect(defineTypeTool.description).toContain('the next agent picks it from its description')
  })
})
