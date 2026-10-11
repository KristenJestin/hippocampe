import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'

const launcher = join(import.meta.dirname, '../../npm/hippocampe/bin/hippo.js')
const scratch = mkdtempSync(join(tmpdir(), 'hippocampe-launcher-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/**
 * An installed tree as npm lays it out: the launcher, then (in `at`, a folder under the root
 * `node_modules`, where npm hoists or nests a dependency) the package of the platform, unless
 * `withPlatform` is false, whose executable prints what it was handed. No PostgreSQL: the
 * executable carries its database.
 */
const install = (name: string, at: string, withPlatform = true) => {
  const root = join(scratch, name, 'node_modules')
  const platform = `${process.platform}-${process.arch}`
  write(join(root, '@netsirk/hippocampe/package.json'), '{"name":"@netsirk/hippocampe"}')
  mkdirSync(join(root, '@netsirk/hippocampe/bin'), { recursive: true })
  copyFileSync(launcher, join(root, '@netsirk/hippocampe/bin/hippo.js'))
  const own = join(root, at, `@netsirk/hippocampe-${platform}`)
  if (withPlatform) {
    write(join(own, 'package.json'), `{"name":"@netsirk/hippocampe-${platform}"}`)
    write(join(own, 'bin/hippo'), '#!/bin/sh\necho "$HIPPOCAMPE_EXECUTABLE $*"\n')
    chmodSync(join(own, 'bin/hippo'), 0o755)
  }
  return { run: () => run(root), executable: join(own, 'bin/hippo') }
}

/**
 * The Node the package runs on. Under `bun --bun` the `node` first on the PATH is Bun, whose
 * resolution of a package's `exports` is not Node's: the launcher is run by the real one.
 */
const node = (process.env['PATH'] ?? '')
  .split(delimiter)
  .map((folder) => join(folder, 'node'))
  .find(
    (file) =>
      existsSync(file) &&
      spawnSync(file, ['-p', 'process.versions.bun']).stdout.toString() === 'undefined\n',
  )

const run = (root: string) =>
  spawnSync(node ?? 'node', [join(root, '@netsirk/hippocampe/bin/hippo.js'), 'serve'], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '' },
  })

describe('the launcher of the npm package', () => {
  test('the launcher runs the executable of its platform, with no PostgreSQL installed', () => {
    const { run: launch, executable } = install('hoisted', '')
    const ran = launch()
    expect(ran.stderr).toBe('')
    expect(ran.stdout.trim()).toBe(`${executable} serve`)
  })

  test('the launcher finds the package of its platform in its own folder', () => {
    const { run: launch, executable } = install('nested', '@netsirk/hippocampe/node_modules')
    expect(launch().stdout.trim()).toBe(`${executable} serve`)
  })

  test('the launcher says in one sentence that there is no build for the platform', () => {
    const ran = install('absent', '', false).run()
    expect(ran.status).toBe(1)
    expect(ran.stdout).toBe('')
    expect(ran.stderr.trim().split('\n')).toHaveLength(1)
    expect(ran.stderr).toContain(`Hippocampe has no build for ${process.platform}-${process.arch}`)
  })
})
