import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { headless, missingCompositor } from './screenshots.ts'

const repository = resolve(import.meta.dirname, '..')

const scratch: string[] = []
afterAll(() => {
  for (const folder of scratch) rmSync(folder, { recursive: true, force: true })
})

describe('the screenshots never open a window on the screen of the machine', () => {
  test('the viewer is given the socket of the headless compositor and never the display of the session', () => {
    const environment = headless(
      { HOME: '/home/someone', DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-1', WAYLAND_SOCKET: '3' },
      '/tmp/runtime',
      'hippocampe-screenshots',
    )
    expect(environment).toEqual({
      HOME: '/home/someone',
      XDG_RUNTIME_DIR: '/tmp/runtime',
      WAYLAND_DISPLAY: 'hippocampe-screenshots',
    })
  })

  test('without Weston and its screenshooter, they are refused in one sentence', () => {
    expect(missingCompositor(() => true)).toBeUndefined()
    expect(missingCompositor((program) => program !== 'weston-screenshooter')).toBe(
      'The screenshots need a headless Wayland compositor and none is installed (weston-screenshooter not found): install Weston. They are never taken on the display of the session.',
    )
  })

  test('the script refuses to run, and starts nothing, on a machine without the compositor', () => {
    // A PATH that holds Bun and nothing else: no Weston, no Cargo, no server started.
    const bin = mkdtempSync(join(tmpdir(), 'screenshots-path-'))
    scratch.push(bin)
    symlinkSync(process.execPath, join(bin, 'bun'))
    const ran = spawnSync(process.execPath, ['tools/screenshots.ts'], {
      cwd: repository,
      env: { PATH: bin, HOME: bin, DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-1' },
      encoding: 'utf8',
    })
    expect(ran.status).toBe(1)
    expect(ran.stderr.trim()).toBe(
      'The screenshots need a headless Wayland compositor and none is installed (weston, weston-screenshooter not found): install Weston. They are never taken on the display of the session.',
    )
    expect(ran.stdout).toBe('')
  })
})
