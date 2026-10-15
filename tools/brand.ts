/**
 * Generates every file derived from the logo, from the SVGs of `assets/brand` (the one source):
 * the PNGs and `favicon.ico` there.
 *
 *   bun tools/brand.ts        (or `bun run brand` at the root)
 *
 * The PNGs are rendered by `rsvg-convert`; without it they are left as committed and the rest is
 * still generated. The text of the social preview is drawn with the fonts of the desktop viewer,
 * which a private fontconfig names, so no font of the machine is used.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** What a run reads beyond the sources and writes: each path is relative to the repository. */
export const WRITTEN: ReadonlyArray<string> = ['assets/brand']

const FONTS = 'apps/desktop/assets/fonts'

/** The PNGs: the source SVG, the size of the square side (the social preview keeps its own), the name. */
const RENDERINGS: ReadonlyArray<readonly [string, number | undefined, string]> = [
  ['icon.svg', 128, 'icon-128.png'],
  ['icon.svg', 256, 'icon-256.png'],
  ['icon.svg', 512, 'icon-512.png'],
  ['icon.svg', 1024, 'icon-1024.png'],
  ['icon.svg', 180, 'apple-touch-icon.png'],
  ['icon-full.svg', 512, 'icon-full-512.png'],
  ['favicon.svg', 16, 'favicon-16.png'],
  ['favicon.svg', 32, 'favicon-32.png'],
  ['social-preview.svg', undefined, 'social-preview.png'],
]

/** The sizes of `favicon.ico`, the ones a browser tab asks for. */
const ICO_SIZES = [16, 32, 48]

export const hasRenderer = () => spawnSync('rsvg-convert', ['--version']).status === 0

/** `rsvg-convert` with a fontconfig of its own, made of the fonts of the viewer only. */
const renderer = (root: string) => {
  const folder = mkdtempSync(join(tmpdir(), 'brand-fonts-'))
  const config = join(folder, 'fonts.conf')
  writeFileSync(
    config,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>` +
      `<dir>${join(root, FONTS)}</dir><cachedir>${join(folder, 'cache')}</cachedir></fontconfig>`,
  )
  const render = (svg: string, side: number | undefined) => {
    const result = spawnSync(
      'rsvg-convert',
      side === undefined ? [svg] : ['-w', String(side), '-h', String(side), svg],
      { env: { ...process.env, FONTCONFIG_FILE: config }, maxBuffer: 64 * 1024 * 1024 },
    )
    if (result.status !== 0) throw new Error(`rsvg-convert failed on ${svg}: ${result.stderr}`)
    return result.stdout
  }
  return { render, done: () => rmSync(folder, { recursive: true, force: true }) }
}

/** An .ico of PNG images, sorted as given (the format has held PNGs since Windows Vista). */
const ico = (images: ReadonlyArray<{ side: number; png: Buffer }>) => {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ side, png }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(side, entry)
    header.writeUInt8(side, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(({ png }) => png)])
}

const renderRasters = (root: string) => {
  const brand = join(root, 'assets/brand')
  mkdirSync(join(brand, 'png'), { recursive: true })
  const { render, done } = renderer(root)
  try {
    for (const [source, side, name] of RENDERINGS) {
      writeFileSync(join(brand, 'png', name), render(join(brand, source), side))
    }
    writeFileSync(
      join(brand, 'favicon.ico'),
      ico(ICO_SIZES.map((side) => ({ side, png: render(join(brand, 'favicon.svg'), side) }))),
    )
  } finally {
    done()
  }
}

/** Writes every derived file under `root`; `render: false` leaves the rasters as they are. */
export const generate = (root: string, options: { render?: boolean } = {}) => {
  if (options.render ?? hasRenderer()) renderRasters(root)
  else console.log('brand: rsvg-convert not found, the PNGs and favicon.ico are left as committed.')
}

if (import.meta.main) {
  generate(resolve(import.meta.dirname, '..'))
}
