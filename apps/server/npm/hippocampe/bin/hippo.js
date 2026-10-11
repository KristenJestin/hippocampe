#!/usr/bin/env node
// Runs the executable of this platform, with where its PostgreSQL binaries are: the package of
// the platform carries both, as esbuild carries its own.
'use strict'
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

const platform = `${process.platform}-${process.arch}`
/**
 * The folder of an installed package, looked for in the `node_modules` of `from` (this launcher
 * by default) and of each folder above it. Not through `require.resolve`: a package that declares
 * `exports`, as the PostgreSQL one does, refuses its own `package.json`.
 */
const found = (name, from = __dirname) => {
  for (let folder = from; ; folder = dirname(folder)) {
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
// A dependency of the package of the platform: looked for from there.
const postgres = found(`@embedded-postgres/${platform}`, own)
if (postgres === undefined) {
  console.error(
    `Hippocampe cannot find its PostgreSQL, the package @embedded-postgres/${platform}.`,
  )
  process.exit(1)
}
const executable = join(own, 'bin', 'hippo')
const env = {
  ...process.env,
  HIPPOCAMPE_EXECUTABLE: executable,
  HIPPOCAMPE_POSTGRES_BINARIES: join(postgres, 'native'),
}
const ran = spawnSync(executable, process.argv.slice(2), { stdio: 'inherit', env })
process.exit(ran.status ?? 1)
