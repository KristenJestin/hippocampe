#!/usr/bin/env bun
/**
 * Runs Gradle tasks of the application through its wrapper, for Turborepo:
 *
 *   bun scripts/gradle.ts testDebugUnitTest
 *
 * Without an Android SDK (`ANDROID_HOME`, `ANDROID_SDK_ROOT` or `sdk.dir` in `local.properties`) or
 * without Java, it says so in one line and does nothing, so that `bun run check` still runs on a
 * machine made for the server; in CI (`CI` set), where the application is always built, it fails.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('..', import.meta.url))
const properties = fileURLToPath(new URL('../local.properties', import.meta.url))

const sdk =
  process.env['ANDROID_HOME'] ??
  process.env['ANDROID_SDK_ROOT'] ??
  (existsSync(properties)
    ? /^sdk\.dir=(.+)$/m.exec(readFileSync(properties, 'utf8'))?.[1]?.trim()
    : undefined)
const java =
  process.env['JAVA_HOME'] ??
  (spawnSync('java', ['-version']).error === undefined ? 'java' : undefined)
const missing =
  sdk === undefined || !existsSync(sdk)
    ? 'no Android SDK (set ANDROID_HOME)'
    : java === undefined
      ? 'no Java (set JAVA_HOME)'
      : undefined

if (missing !== undefined) {
  const line = `apps/android: ${missing}, so \`gradlew ${process.argv.slice(2).join(' ')}\` is skipped.`
  if (process.env['CI']) {
    console.error(line)
    process.exit(1)
  }
  console.log(line)
  process.exit(0)
}

const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const run = spawnSync(wrapper, process.argv.slice(2), { cwd: here, stdio: 'inherit', shell: true })
process.exit(run.status ?? 1)
