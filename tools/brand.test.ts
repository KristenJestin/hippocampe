import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { generate, hasRenderer, WRITTEN } from './brand.ts'

const repository = resolve(import.meta.dirname, '..')

const scratch: string[] = []
afterAll(() => {
  for (const folder of scratch) rmSync(folder, { recursive: true, force: true })
})

/** A copy of what the generator reads and writes, so a run never touches the working tree. */
const copy = () => {
  const root = mkdtempSync(join(tmpdir(), 'brand-'))
  scratch.push(root)
  for (const path of WRITTEN) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    cpSync(join(repository, path), join(root, path), { recursive: true })
  }
  return root
}

/** Every file under the written paths, with its bytes, by path. */
const snapshot = (root: string) => {
  const files = new Map<string, string>()
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name)
      if (entry.isDirectory()) walk(path)
      else files.set(path, readFileSync(join(root, path)).toString('base64'))
    }
  }
  for (const path of WRITTEN) {
    if (path.endsWith('.ts')) files.set(path, readFileSync(join(root, path)).toString('base64'))
    else walk(path)
  }
  return files
}

const changed = (before: Map<string, string>, after: Map<string, string>) =>
  [...new Set([...before.keys(), ...after.keys()])].filter(
    (path) => before.get(path) !== after.get(path),
  )

describe('the logo has one source and every other file is generated from it', () => {
  test('generating twice leaves the tree unchanged', () => {
    const root = copy()
    generate(root)
    const first = snapshot(root)
    generate(root)
    expect(changed(first, snapshot(root))).toEqual([])
  }, 120_000)

  test('what does not depend on the renderer is the committed one', () => {
    const root = copy()
    generate(root, { render: false })
    expect(changed(snapshot(repository), snapshot(root))).toEqual([])
  })

  test.skipIf(!hasRenderer())(
    'the renderings have the sizes of their names',
    () => {
      const root = copy()
      generate(root)
      const size = (file: string) => {
        const bytes = readFileSync(join(root, 'assets/brand', file))
        return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
      }
      expect(size('png/icon-256.png')).toEqual([256, 256])
      expect(size('png/apple-touch-icon.png')).toEqual([180, 180])
      expect(size('png/social-preview.png')).toEqual([1280, 640])
    },
    120_000,
  )

  test('favicon.ico holds the three sizes of a browser tab', () => {
    const ico = readFileSync(join(repository, 'assets/brand/favicon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1)
    const images = ico.readUInt16LE(4)
    const sizes = Array.from({ length: images }, (_, index) => ico.readUInt8(6 + index * 16))
    expect(sizes).toEqual([16, 32, 48])
  })

  test('the drawing is the same two paths in every variant, with the colours of each', () => {
    const read = (file: string) => readFileSync(join(repository, 'assets/brand', file), 'utf8')
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((match) => match[1])
    const horn = paths(read('horn.svg'))
    expect(horn).toHaveLength(2)
    for (const file of [
      'horn-on-light.svg',
      'icon.svg',
      'icon-full.svg',
      'favicon.svg',
      'android-foreground.svg',
      'social-preview.svg',
    ]) {
      expect(paths(read(file)), file).toEqual(horn)
    }
    expect(read('icon-full.svg')).toContain('fill="#5ed39a"')
    expect(read('icon-full.svg')).toContain('stroke="#155b3d"')
  })
})
