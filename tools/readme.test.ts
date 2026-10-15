import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const repository = resolve(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(repository, path), 'utf8')

/** The files a document names as a link, an image or a `<source>`, without addresses or anchors. */
const localTargets = (path: string) =>
  [...read(path).matchAll(/(?:\]\(|src="|srcset=")([^)"\s]+)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(https?:|#|mailto:)/.test(target))
    .map((target) => join(dirname(path), target.split('#')[0]))

describe('the README is the front page of the project', () => {
  test('it opens on the mark in both variants, the name and the tagline', () => {
    const readme = read('README.md')
    expect(readme).toContain('<picture>')
    expect(readme).toContain('assets/brand/horn.svg')
    expect(readme).toContain('assets/brand/horn-on-light.svg')
    expect(readme).toContain(
      'A personal knowledge system managed by AI agents through MCP, read and kept by you.',
    )
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
