import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ANDROID, DESKTOP, OUTPUT } from './screenshots.ts'

const repository = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(repository, path), 'utf8')

/** The files a document names as a link, an image or a `<source>`, without addresses or anchors. */
const localTargets = (path: string) =>
  [...read(path).matchAll(/(?:\]\(|src="|srcset=")([^)"\s]+)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|#|mailto:)/.test(target))
    .map((target) => join(dirname(path), target.split('#')[0]))

describe('the README is the front page of the project', () => {
  test('it opens on the banner, 1280 by 640, and says the tagline in words', () => {
    const readme = read('README.md')
    expect(readme.trimStart()).toMatch(
      /^<div align="center">\s*<img src="assets\/brand\/png\/social-preview\.png"/,
    )
    const banner = readFileSync(join(repository, 'assets/brand/png/social-preview.png'))
    expect([banner.readUInt32BE(16), banner.readUInt32BE(20)]).toEqual([1280, 640])
    expect(readme).toContain(
      'A personal knowledge system managed by AI agents through MCP, read and kept by you.',
    )
  })

  test('it says how it works before it shows the applications', () => {
    const readme = read('README.md')
    const sections = [...readme.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(sections.slice(0, 4)).toEqual([
      'What it is',
      'How it works',
      'The pieces',
      'Screenshots',
    ])
    expect(readme).toContain('```mermaid')
  })

  test('the screenshots show every image the script takes, desktop then Android, captioned', () => {
    const readme = read('README.md')
    const shown = [...readme.matchAll(/<img src="docs\/screenshots\/([\w-]+)\.png"/g)].map(
      (match) => match[1],
    )
    expect(shown).toEqual([...DESKTOP.map((shot) => shot.name), ...ANDROID])
    expect(readdirSync(join(repository, OUTPUT)).sort()).toEqual(
      shown.map((name) => `${name}.png`).sort(),
    )
    for (const name of shown) {
      expect(readme, name).toMatch(new RegExp(`${name}\\.png"[^>]*> <br> \\*\\*[^*]+\\*\\*: `))
    }
  })

  test('the desktop screenshots are 1600 pixels wide at most', () => {
    for (const shot of DESKTOP) {
      const png = readFileSync(join(repository, OUTPUT, `${shot.name}.png`))
      expect(png.readUInt32BE(16), shot.name).toBeLessThanOrEqual(1600)
    }
  })

  test('every link and image of the README and of the desktop page is a file of the tree', () => {
    for (const document of ['README.md', 'docs/desktop.md']) {
      for (const target of localTargets(document)) {
        expect(existsSync(join(repository, target)), `${document}: ${target}`).toBe(true)
      }
    }
  })

  test('its badges point at things that exist: the CI of dev, the licence, the releases', () => {
    const readme = read('README.md')
    expect(readme).toContain('actions/workflows/ci.yml/badge.svg?branch=dev')
    expect(existsSync(join(repository, '.github/workflows/ci.yml'))).toBe(true)
    expect(readme).toContain('(LICENSE)')
    expect(readme).toContain('/releases/latest')
  })

  test('the installation of the desktop viewer keeps its details in docs/desktop.md', () => {
    const page = read('docs/desktop.md')
    for (const fact of [
      'hippocampe-desktop-<version>-linux-x86_64.tar.gz',
      'hippocampe-desktop-<version>-windows-x86_64.zip',
      'sh update.sh --check',
      '~/.config/hippocampe/',
      'hippocampe-desktop --version',
      '9.9.9-local',
      'hippocampe-desktop.exe',
    ]) {
      expect(page, fact).toContain(fact)
    }
    expect(read('README.md')).toContain('docs/desktop.md')
  })
})
