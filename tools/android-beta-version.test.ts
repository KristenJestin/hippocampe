import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

import { betaVersion, lastRelease } from './android-beta-version.ts'

const repository = resolve(import.meta.dirname, '..')

describe('the version of the Android beta follows the last release', () => {
  test('the patch after the last release, numbered by the run, with a previous beta present', () => {
    expect(betaVersion(['v0.14.0', 'v0.14.1', 'v0.14.2-beta.20'], 21)).toBe('0.14.2-beta.21')
  })

  test('with no release tag, the beta is 0.0.1-beta.<run>', () => {
    expect(betaVersion([], 21)).toBe('0.0.1-beta.21')
    expect(betaVersion(['v0.0.1-beta.3'], 21)).toBe('0.0.1-beta.21')
  })

  test('a higher pre-release tag never counts as the last release', () => {
    const tags = ['v0.14.1', 'v0.15.0-beta.30', 'v1.0.0-rc.1']
    expect(lastRelease(tags)).toBe('0.14.1')
    expect(betaVersion(tags, 31)).toBe('0.14.2-beta.31')
  })

  test('the last release is the highest version, not the last in the alphabet', () => {
    expect(lastRelease(['v0.9.0', 'v0.10.0', 'v0.2.12'])).toBe('0.10.0')
  })

  test('a tag that is not a version is ignored', () => {
    expect(lastRelease(['android-beta', 'v0.3.0', 'vnext', 'v1.2'])).toBe('0.3.0')
  })

  test('the version carries no build metadata', () => {
    expect(betaVersion(['v1.2.3'], 7)).not.toContain('+')
  })
})

describe('the command prints the version for the tags of the repository', () => {
  test('it reads the tags of the current repository and the run number given', () => {
    const folder = mkdtempSync(join(tmpdir(), 'hippocampe-beta-'))
    try {
      const git = (...args: string[]) =>
        spawnSync('git', ['-c', 'tag.gpgSign=false', '-c', 'commit.gpgSign=false', ...args], {
          cwd: folder,
          encoding: 'utf8',
        })
      git('init', '-q')
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.org',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      )
      for (const tag of ['v0.14.1', 'v0.14.2-beta.20']) git('tag', tag)
      const result = spawnSync('bun', [join(repository, 'tools/android-beta-version.ts'), '21'], {
        cwd: folder,
        encoding: 'utf8',
      })
      expect(result.stdout).toBe('0.14.2-beta.21\n')
      expect(result.status).toBe(0)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  test('without a run number, it refuses', () => {
    const result = spawnSync('bun', [join(repository, 'tools/android-beta-version.ts')], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(2)
  })
})

describe('the workflow publishes one beta, tagged and titled by its version', () => {
  const workflow = readFileSync(join(repository, '.github/workflows/android-beta.yml'), 'utf8')

  test('it computes the version with the tool, and keeps no fixed tag', () => {
    expect(workflow).toContain('bun "$GITHUB_WORKSPACE/tools/android-beta-version.ts"')
    expect(workflow).not.toMatch(/gh release (view|create|delete) android-beta/)
  })

  test('it makes the release with the version as tag and title, a pre-release, never the latest', () => {
    expect(workflow).toMatch(
      /gh release create "v\$VERSION".*--prerelease --latest=false.*--title "v\$VERSION"/,
    )
  })

  test('it deletes the previous betas, by their tag pattern, before it makes the new one', () => {
    const deleting = workflow.indexOf("git tag --list 'v*-beta.*'")
    expect(deleting).toBeGreaterThan(0)
    expect(deleting).toBeLessThan(workflow.indexOf('gh release create'))
  })
})
