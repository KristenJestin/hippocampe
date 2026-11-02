import { McpSchema } from 'effect/ai'
import { MCP_ICON } from '../brand.ts'

/**
 * The icon the MCP server announces in its server information: the horn of the logo, an SVG
 * inline as a data URI (the revisions from 2025-11-25 carry `icons`; the older ones leave it out).
 * Small on purpose, as the stateless protocol repeats the server information in every answer.
 */
export const ICONS = [new McpSchema.Icon({ src: MCP_ICON, mimeType: 'image/svg+xml' })]
