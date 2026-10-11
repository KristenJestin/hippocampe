import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(repository, path), 'utf8')

describe('the production image carries what the server needs, and no PostgreSQL', () => {
  test('no PostgreSQL binaries are installed, the development ones included', () => {
    expect(read('apps/server/package.json')).not.toContain('@embedded-postgres')
    expect(read('apps/server/Dockerfile')).toContain('bun install --frozen-lockfile --production')
  })
})
