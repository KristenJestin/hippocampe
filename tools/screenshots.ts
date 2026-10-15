/**
 * Takes the screenshots of the README, from a Hippocampe of its own: a server on a database it
 * runs in a temporary folder, filled through MCP with invented data, as an agent would, then
 * read by the desktop viewer in a headless Wayland compositor and by the Android screens under
 * Robolectric. Nothing ever opens on the screen of the machine that runs it.
 *
 *   bun tools/screenshots.ts           (or `bun run screenshots` at the root)
 *
 * It needs `weston` (the headless compositor and its screenshooter), Cargo for the viewer, and an
 * Android SDK with Java 17 or later for the phone; without the compositor it refuses to run
 * rather than use the display of the session, and without the SDK it leaves the phone's images
 * as they are. The PNGs are written to `docs/screenshots/`.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Call, calls } from './screenshots-data.ts'

const repository = resolve(import.meta.dirname, '..')
const SERVER = join(repository, 'apps/server')
export const OUTPUT = 'docs/screenshots'

type Environment = Readonly<Record<string, string | undefined>>

/** `environment` without the session's display, X11 or Wayland. */
const withoutDisplay = (environment: Environment) => {
  const {
    DISPLAY: _display,
    WAYLAND_DISPLAY: _wayland,
    WAYLAND_SOCKET: _socket,
    ...rest
  } = environment
  return rest
}

/** The environment of a program run in the compositor: its socket, and never the session's display. */
export const headless = (environment: Environment, runtime: string, socket: string) => ({
  ...withoutDisplay(environment),
  XDG_RUNTIME_DIR: runtime,
  WAYLAND_DISPLAY: socket,
})

/** Why the desktop screenshots cannot be taken here, when they cannot: a missing program. */
export const missingCompositor = (found: (program: string) => boolean) => {
  const missing = ['weston', 'weston-screenshooter'].filter((program) => !found(program))
  return missing.length === 0
    ? undefined
    : `The screenshots need a headless Wayland compositor and none is installed (${missing.join(', ')} not found): install Weston. They are never taken on the display of the session.`
}

const installed = (program: string) => spawnSync('which', [program]).status === 0

/** Copies a PNG to `target`, compressed by ImageMagick then oxipng when they are installed. */
const keep = (source: string, target: string) => {
  if (installed('magick')) {
    spawnSync('magick', [source, '-strip', '-define', 'png:compression-level=9', target])
  } else copyFileSync(source, target)
  if (installed('oxipng')) spawnSync('oxipng', ['-o', '4', '--strip', 'safe', target])
}

/** The port of the server: always the same, as the viewer shows it in its sidebar. */
const PORT = 47291

/** Whether no one listens on `port` of the loopback. */
const free = (port: number) =>
  new Promise<boolean>((done) => {
    const probe = createServer()
    probe.once('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })

const wait = (milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds))

/** Polls `ready` every 100 ms until it holds, or fails after `seconds`, saying what it waited for. */
const until = async (
  what: string,
  seconds: number,
  ready: () => Promise<boolean> | boolean,
): Promise<void> => {
  if (await ready()) return
  if (seconds <= 0) throw new Error(`Gave up waiting for ${what}.`)
  await wait(100)
  return until(what, seconds - 0.1, ready)
}

/** Runs `step` on each of `items`, one after the other. */
const inTurn = <T>(items: ReadonlyArray<T>, step: (item: T) => Promise<void>) =>
  items.reduce((previous, item) => previous.then(() => step(item)), Promise.resolve())

/** A Hippocampe of its own: a key, then the server, on a database in `folder`. */
const startServer = async (folder: string) => {
  const port = PORT
  if (!(await free(port))) throw new Error(`Port ${port} is in use: stop what listens on it first.`)
  const environment = {
    PATH: process.env['PATH'] ?? '',
    HOME: join(folder, 'home'),
    HIPPOCAMPE_INSTANCE: 'local',
    HIPPOCAMPE_INSTANCE_LABEL: 'Screenshots',
    HIPPOCAMPE_DATABASE_DIR: join(folder, 'postgres'),
    MEDIA_DIR: join(folder, 'media'),
    PORT: String(port),
    BETTER_AUTH_SECRET: 'a-secret-for-the-screenshots-only-0123456789',
  }
  const hippo = (...args: ReadonlyArray<string>) => {
    const ran = spawnSync(process.execPath, ['src/cli.ts', ...args], {
      cwd: SERVER,
      env: environment,
      encoding: 'utf8',
    })
    if (ran.status !== 0) throw new Error(`hippo ${args[0]} failed: ${ran.stderr}`)
    return ran.stdout
  }
  const key = (name: string, rights: string) =>
    hippo('key:create', '--name', name, '--rights', rights, '--owner', 'owner@example.org')
      .trim()
      .split('\n')
      .at(-1)
      ?.trim() ?? ''
  const agent = key('agent', 'read,write')
  const reader = key('reader', 'read,write')
  const server = spawn(process.execPath, ['src/cli.ts', 'serve'], {
    cwd: SERVER,
    env: environment,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const address = `http://127.0.0.1:${port}`
  await until('the server', 60, () =>
    fetch(`${address}/health`).then(
      (response) => response.ok,
      () => false,
    ),
  )
  return { address, agent, reader, server }
}

/** The JSON-RPC message of an MCP answer, sent as JSON or as one server-sent event. */
const message = async (response: Response) => {
  const text = await response.text()
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
        .join('')
    : text
  // SAFETY: the server answers JSON-RPC; a refusal is read from `error` or `isError` below.
  return JSON.parse(json) as {
    result?: { isError?: boolean; content?: ReadonlyArray<{ text: string }> }
    error?: { message: string }
  }
}

/** Makes every call of `made` as an agent with `key`, in order; the first refusal stops the run. */
const fill = async (address: string, key: string, made: ReadonlyArray<Call>) => {
  const protocol = '2025-06-18'
  let session = ''
  let id = 0
  const post = async (method: string, params: Call['arguments']) => {
    id += 1
    const headers = new Headers({
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    })
    if (session !== '') {
      headers.set('mcp-session-id', session)
      headers.set('mcp-protocol-version', protocol)
    }
    const response = await fetch(`${address}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    session ||= response.headers.get('mcp-session-id') ?? ''
    return message(response)
  }
  await post('initialize', {
    protocolVersion: protocol,
    capabilities: {},
    clientInfo: { name: 'screenshots', version: '1' },
  })
  await inTurn(made, async (call) => {
    const answer = await post('tools/call', { name: call.tool, arguments: call.arguments })
    if (answer.error !== undefined || answer.result?.isError === true) {
      const said =
        answer.error?.message ?? answer.result?.content?.map((part) => part.text).join('')
      throw new Error(`${call.tool} was refused: ${said}`)
    }
  })
}

/** A screenshot of the viewer: its file, what it opens at start, and in which theme. */
interface DesktopShot {
  readonly name: string
  readonly start: ReadonlyArray<string>
  readonly theme: 'dark' | 'light'
}

export const DESKTOP: ReadonlyArray<DesktopShot> = [
  { name: 'desktop-entry', start: ['--open', 'lemon-tart'], theme: 'dark' },
  { name: 'desktop-links', start: ['--open', 'kitchen-renovation'], theme: 'dark' },
  { name: 'desktop-search', start: ['--search', 'kitchen'], theme: 'dark' },
  { name: 'desktop-light', start: ['--open', 'claire-morel'], theme: 'light' },
]

/** The phone's screenshots, as `ScreenshotsTest` names them. */
export const ANDROID: ReadonlyArray<string> = ['android-home', 'android-entry', 'android-share']

/** The size of the compositor's one output, which the viewer fills. */
const WIDTH = 1600
const HEIGHT = 1000

/** The viewer, built from the tree. */
const buildViewer = () => {
  const desktop = join(repository, 'apps/desktop')
  const built = spawnSync('cargo', ['build', '-p', 'app'], { cwd: desktop, stdio: 'inherit' })
  if (built.status !== 0) throw new Error('The viewer did not build.')
  const target = process.env['CARGO_TARGET_DIR'] ?? join(desktop, 'target')
  return join(target, 'debug', 'hippocampe-desktop')
}

/** Ends `child` and waits until it has. */
const stop = (child: ChildProcess) =>
  new Promise<void>((done) => {
    if (child.exitCode !== null || child.signalCode !== null) return done()
    child.once('exit', () => done())
    child.kill('SIGTERM')
  })

/**
 * Each screenshot of `DESKTOP`, of the viewer on `address` in a Weston of its own, headless, on a
 * socket in `folder`: the session's display is taken out of every environment given.
 */
const shootDesktop = async (folder: string, address: string, key: string, output: string) => {
  const viewer = buildViewer()
  const runtime = join(folder, 'runtime')
  const config = join(folder, 'config')
  const shots = join(folder, 'shots')
  for (const path of [runtime, join(config, 'hippocampe'), shots])
    mkdirSync(path, { recursive: true })
  chmodSync(runtime, 0o700)
  writeFileSync(join(config, 'key'), key, { mode: 0o600 })
  const socket = 'hippocampe-screenshots'
  const environment = headless(process.env, runtime, socket)
  const weston = spawn(
    'weston',
    [
      '--backend=headless',
      '--fake-seat',
      '--renderer=pixman',
      `--width=${WIDTH}`,
      `--height=${HEIGHT}`,
      '--shell=kiosk',
      '--no-config',
      '--debug',
      `--socket=${socket}`,
    ],
    { env: environment, stdio: 'ignore' },
  )
  try {
    await until('Weston', 10, () => existsSync(join(runtime, socket)))
    await inTurn(DESKTOP, async (shot) => {
      writeFileSync(
        join(config, 'hippocampe', 'desktop.json'),
        JSON.stringify({ server: address, key_file: join(config, 'key'), theme: shot.theme }),
      )
      // No cursor theme: the pointer of the fake seat draws nothing over the screen.
      const app = spawn(viewer, shot.start, {
        env: { ...environment, XDG_CONFIG_HOME: config, XCURSOR_PATH: join(folder, 'no-cursors') },
        stdio: 'ignore',
      })
      // The viewer says nothing when it has drawn: the time for a debug build to start, ask the
      // server and lay out, with room to spare.
      await wait(6000)
      for (const file of readdirSync(shots)) rmSync(join(shots, file))
      const taken = spawnSync('weston-screenshooter', [], { cwd: shots, env: environment })
      await stop(app)
      const [file] = readdirSync(shots)
      if (taken.status !== 0 || file === undefined) {
        throw new Error(`weston-screenshooter failed: ${taken.stderr}`)
      }
      keep(join(shots, file), join(output, `${shot.name}.png`))
      console.log(`screenshots: ${shot.name}.png`)
    })
  } finally {
    await stop(weston)
  }
}

/** The phone's screenshots, by `ScreenshotsTest` under Robolectric, of the app on `address`. */
const shootAndroid = (folder: string, address: string, key: string, output: string) => {
  const shots = join(folder, 'android')
  mkdirSync(shots, { recursive: true })
  spawnSync(
    'bun',
    [
      'scripts/gradle.ts',
      'testDebugUnitTest',
      '--tests',
      'fr.kristenjestin.hippocampe.ScreenshotsTest',
      '--rerun',
    ],
    {
      cwd: join(repository, 'apps/android'),
      stdio: 'inherit',
      env: {
        ...withoutDisplay(process.env),
        HIPPOCAMPE_SCREENSHOTS_SERVER: address,
        HIPPOCAMPE_SCREENSHOTS_KEY: key,
        HIPPOCAMPE_SCREENSHOTS_DIR: shots,
      },
    },
  )
  const taken = readdirSync(shots)
  if (taken.length === 0) {
    console.log('screenshots: no Android SDK or Java here, the phone images are left as they are.')
  }
  for (const file of taken) {
    keep(join(shots, file), join(output, file))
    console.log(`screenshots: ${file}`)
  }
}

const main = async () => {
  const refused = missingCompositor(installed)
  if (refused !== undefined) {
    console.error(refused)
    process.exit(1)
  }
  const folder = mkdtempSync(join(tmpdir(), 'hippocampe-screenshots-'))
  const output = join(repository, OUTPUT)
  mkdirSync(output, { recursive: true })
  const { address, agent, reader, server } = await startServer(folder)
  try {
    await fill(address, agent, calls(new Date().toISOString().slice(0, 10)))
    await shootDesktop(folder, address, reader, output)
    shootAndroid(folder, address, reader, output)
  } finally {
    await stop(server)
    rmSync(folder, { recursive: true, force: true })
  }
}

if (import.meta.main) await main()
