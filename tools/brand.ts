/**
 * Generates every file derived from the logo, from the SVGs of `assets/brand` (the one source):
 * the PNGs and `favicon.ico` there, the vector drawables and colours of the Android launcher, and
 * the icon of the desktop viewer, and the favicons and the MCP icon the server answers.
 *
 *   bun tools/brand.ts        (or `bun run brand` at the root)
 *
 * The PNGs are rendered by `rsvg-convert`; without it they are left as committed and the rest is
 * still generated. The text of the social preview is drawn with the fonts of the desktop viewer and
 * the monospace of `assets/brand/fonts`, which a private fontconfig names, so no font of the machine
 * is used.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** What a run reads beyond the sources and writes: each path is relative to the repository. */
const ANDROID = 'apps/android/app/src'
export const WRITTEN: ReadonlyArray<string> = [
  'assets/brand',
  `${ANDROID}/main/res/drawable/ic_launcher_foreground.xml`,
  `${ANDROID}/main/res/drawable/ic_launcher_monochrome.xml`,
  `${ANDROID}/main/res/drawable/ic_notification.xml`,
  `${ANDROID}/main/res/values/colors.xml`,
  `${ANDROID}/beta/res/drawable/ic_launcher_foreground.xml`,
  `${ANDROID}/beta/res/values/colors.xml`,
  'apps/desktop/assets/release/hippocampe.svg',
  'apps/desktop/assets/release/hippocampe.png',
  'apps/server/src/brand.ts',
]

/** The fonts of the viewer, and those only the brand draws with (the monospace). */
const FONTS = ['apps/desktop/assets/fonts', 'assets/brand/fonts']

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
      FONTS.map((fonts) => `<dir>${join(root, fonts)}</dir>`).join('') +
      `<cachedir>${join(folder, 'cache')}</cachedir></fontconfig>`,
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

interface Stroke {
  readonly d: string
  readonly color: string
  readonly width: string
}

interface Drawing {
  /** The fill of the background square, when the SVG has one. */
  readonly background: string | undefined
  /** `translate(x y) scale(s)` of the group, when the drawing is placed in a canvas. */
  readonly placement: { readonly x: string; readonly y: string; readonly scale: string } | undefined
  readonly strokes: ReadonlyArray<Stroke>
}

/** What an SVG of `assets/brand` draws: the two strokes of the horn, and where they are placed. */
const drawing = (svg: string): Drawing => {
  const placement = svg.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)
  return {
    background: svg.match(/<rect[^>]* fill="(#[0-9a-f]{6})"/)?.[1],
    placement: placement && { x: placement[1], y: placement[2], scale: placement[3] },
    strokes: [
      ...svg.matchAll(/<path d="([^"]+)"[^>]* stroke="(#[0-9a-f]{6})" stroke-width="(\d+)"/g),
    ].map(([, d, color, width]) => ({ d, color, width })),
  }
}

const XML = '<?xml version="1.0" encoding="utf-8"?>'
const header = (source: string) =>
  `<!-- Generated by tools/brand.ts from assets/brand/${source}: do not edit. -->`

/** A vector drawable of strokes with round caps, in the group that places them in its viewport. */
const vector = (
  source: string,
  size: number,
  placement: { readonly x: string; readonly y: string; readonly scale: string },
  strokes: ReadonlyArray<Stroke>,
) =>
  [
    XML,
    header(source),
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${size}dp"`,
    `    android:height="${size}dp"`,
    `    android:viewportWidth="${size}"`,
    `    android:viewportHeight="${size}">`,
    '    <group',
    `        android:translateX="${placement.x}"`,
    `        android:translateY="${placement.y}"`,
    `        android:scaleX="${placement.scale}"`,
    `        android:scaleY="${placement.scale}">`,
    ...strokes.flatMap(({ d, color, width }) => [
      '        <path',
      `            android:pathData="${d}"`,
      `            android:strokeColor="${color}"`,
      `            android:strokeWidth="${width}"`,
      '            android:strokeLineCap="round" />',
    ]),
    '    </group>',
    '</vector>',
    '',
  ].join('\n')

const color = (source: string, hex: string) =>
  [
    XML,
    header(source),
    '<resources>',
    `    <color name="launcher_background">${hex}</color>`,
    '</resources>',
    '',
  ].join('\n')

/** The horn in a box of `size` with `margin` all around, centred: the placement of the mark alone. */
const fitted = (viewBox: string, size: number, margin: number) => {
  const [x, y, width, height] = viewBox.split(' ').map(Number)
  const scale = (size - 2 * margin) / Math.max(width, height)
  const round = (value: number) => String(Math.round(value * 1e4) / 1e4)
  return {
    x: round((size - width * scale) / 2 - x * scale),
    y: round((size - height * scale) / 2 - y * scale),
    scale: round(scale),
  }
}

const write = (root: string, path: string, content: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), content)
}

const generateAndroid = (root: string) => {
  const source = (file: string) => drawing(readFileSync(join(root, 'assets/brand', file), 'utf8'))
  const foreground = source('android-foreground.svg')
  const horn = readFileSync(join(root, 'assets/brand/horn.svg'), 'utf8')
  const placement = foreground.placement
  if (!placement) throw new Error('android-foreground.svg places the drawing in a group')
  const main = `${ANDROID}/main/res`
  const beta = `${ANDROID}/beta/res`
  const recolored = (strokes: ReadonlyArray<Stroke>, hex: string) =>
    strokes.map(({ d, width }) => ({ d, width, color: hex }))
  const white = recolored(source('horn.svg').strokes, '#ffffff')
  const black = recolored(foreground.strokes, '#000000')

  write(
    root,
    `${main}/drawable/ic_launcher_foreground.xml`,
    vector('android-foreground.svg', 108, placement, foreground.strokes),
  )
  write(
    root,
    `${main}/drawable/ic_launcher_monochrome.xml`,
    vector('android-foreground.svg', 108, placement, black),
  )
  write(
    root,
    `${main}/drawable/ic_notification.xml`,
    vector('horn.svg', 24, fitted(horn.match(/viewBox="([^"]+)"/)?.[1] ?? '', 24, 2), white),
  )
  write(root, `${main}/values/colors.xml`, color('icon.svg', source('icon.svg').background ?? ''))
  // The beta tells itself apart in the launcher: the colours of the full icon, the same drawing.
  const full = source('icon-full.svg')
  write(
    root,
    `${beta}/drawable/ic_launcher_foreground.xml`,
    vector('icon-full.svg', 108, placement, full.strokes),
  )
  write(root, `${beta}/values/colors.xml`, color('icon-full.svg', full.background ?? ''))
}

/** What the server answers: the favicons, and the icon it announces over MCP, as a module. */
const generateServer = (root: string) => {
  const brand = (file: string) => readFileSync(join(root, 'assets/brand', file))
  /** A string constant; a final line break is written as `\\n`, as the files end with one. */
  const constant = (name: string, value: string) => {
    const text = value.replace(/\n$/, '')
    if (/['\\\n]/.test(text)) throw new Error(`${name} cannot be written as a string literal`)
    return `export const ${name} =\n  '${text}${text === value ? '' : '\\n'}'\n`
  }
  write(
    root,
    'apps/server/src/brand.ts',
    [
      '// Generated by tools/brand.ts from assets/brand: do not edit.',
      '',
      '/** `favicon.svg`, answered at `/favicon.svg`. */',
      constant('FAVICON_SVG', brand('favicon.svg').toString('utf8')),
      '/** `favicon.ico` in base64, answered at `/favicon.ico`. */',
      constant('FAVICON_ICO_BASE64', brand('favicon.ico').toString('base64')),
      '/** `icon.svg` as a data URI: the icon the MCP server announces. */',
      constant('MCP_ICON', `data:image/svg+xml;base64,${brand('icon.svg').toString('base64')}`),
    ].join('\n'),
  )
}

/** Writes every derived file under `root`; `render: false` leaves the rasters as they are. */
export const generate = (root: string, options: { render?: boolean } = {}) => {
  if (options.render ?? hasRenderer()) renderRasters(root)
  else console.log('brand: rsvg-convert not found, the PNGs and favicon.ico are left as committed.')
  generateAndroid(root)
  generateServer(root)
  // The icon of the viewer's archive and of its launcher, installed as 256x256 by update.sh.
  copyFileSync(
    join(root, 'assets/brand/icon.svg'),
    join(root, 'apps/desktop/assets/release/hippocampe.svg'),
  )
  copyFileSync(
    join(root, 'assets/brand/png/icon-256.png'),
    join(root, 'apps/desktop/assets/release/hippocampe.png'),
  )
}

if (import.meta.main) {
  generate(resolve(import.meta.dirname, '..'))
}
