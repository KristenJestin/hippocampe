#!/usr/bin/env bun
/**
 * The version of the Android beta: the patch after the last released version, as a pre-release
 * numbered by the run of the workflow (`0.14.2-beta.21`), so that it sorts after the release it
 * was built on.
 *
 *   bun tools/android-beta-version.ts <run>    prints it, from the `v*` tags of this repository
 */

import { spawnSync } from 'node:child_process'

const RELEASE = /^v(\d+)\.(\d+)\.(\d+)$/

/** The highest released version among the tags, `0.0.0` with none; a pre-release never counts. */
export function lastRelease(tags: readonly string[]): string {
  let highest: readonly number[] = [0, 0, 0]
  for (const tag of tags) {
    const match = RELEASE.exec(tag)
    if (match === null) continue
    const version = [Number(match[1]), Number(match[2]), Number(match[3])]
    if ((version[0]! - highest[0]! || version[1]! - highest[1]! || version[2]! - highest[2]!) > 0) {
      highest = version
    }
  }
  return highest.join('.')
}

/** The version of the beta of this run, without build metadata. */
export function betaVersion(tags: readonly string[], run: number): string {
  const [major, minor, patch] = lastRelease(tags).split('.')
  return `${major}.${minor}.${Number(patch) + 1}-beta.${run}`
}

if (import.meta.main) {
  const run = Number(process.argv[2])
  if (!Number.isInteger(run) || run < 1) {
    console.error('usage: bun tools/android-beta-version.ts <run>')
    process.exit(2)
  }
  const tags = spawnSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).stdout.split('\n')
  console.log(betaVersion(tags, run))
}
