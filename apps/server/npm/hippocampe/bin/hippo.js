#!/usr/bin/env node
// Runs the executable of this platform: the package of the platform carries it, its database
// included, as esbuild carries its own.
'use strict'
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

const platform = `${process.platform}-${process.arch}`
/**
 * The folder of an installed package, looked for in the `node_modules` of this launcher's folder
 * and of each folder above it, wherever npm hoisted or nested it.
 */
const found = (name) => {
  for (let folder = __dirname; ; folder = dirname(folder)) {
    const candidate = join(folder, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    if (dirname(folder) === folder) return undefined
  }
}
const own = found(`@netsirk/hippocampe-${platform}`)
if (own === undefined) {
  console.error(`Hippocampe has no build for ${platform} yet: Linux x64 only, for now.`)
  process.exit(1)
}
const executable = join(own, 'bin', 'hippo')
const env = { ...process.env, HIPPOCAMPE_EXECUTABLE: executable }
const ran = spawnSync(executable, process.argv.slice(2), { stdio: 'inherit', env })
process.exit(ran.status ?? 1)
