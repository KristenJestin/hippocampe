/**
 * The database of a Hippocampe installed on a workstation: PGlite, PostgreSQL compiled to
 * WebAssembly, in a folder, inside the process that opens it. No server runs beside it.
 *
 * PGlite has one session. The process that opens the folder serves that session on a Unix socket
 * in the folder (readable by this user only, as the folder is), and every client, its own pool
 * included, speaks PostgreSQL to it through `@effect/sql-pg`, as to a server. The socket gives
 * the session to one connection at a time, from its first message until PGlite says it is idle
 * again (`ReadyForQuery` with the status `I`): a transaction, or the messages of one statement up
 * to their `Sync`, runs alone, and another connection waits its turn, as on a lock. A command run
 * while the server holds the folder reaches the database through that socket; when no one holds
 * it, the command opens the folder itself. A lock file says who holds it: never two writers.
 */
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createConnection, createServer, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Effect, Schedule, Schema } from 'effect'

export class EmbeddedDatabaseBusy extends Schema.TaggedError<EmbeddedDatabaseBusy>()(
  'EmbeddedDatabaseBusy',
  { folder: Schema.String, holder: Schema.Number },
) {
  override get message() {
    return `The database ${this.folder} is open in another process (${this.holder}), and does not answer on its socket: wait for it to end, or stop it.`
  }
}

/** The major version of the PostgreSQL inside PGlite: a database folder belongs to it. */
export const POSTGRES_MAJOR = 18

/** Where the process that holds the folder serves its session. */
export const socketOf = (folder: string) => join(folder, '.s.PGSQL.5432')

/** The file that names the process holding the folder. */
const lockOf = (folder: string) => join(folder, 'hippocampe.pid')

/** The database itself, as PGlite lays it out. */
const dataOf = (folder: string) => join(folder, 'pgdata')

/** Whether a process answers on that socket. */
const answers = (path: string) =>
  Effect.callback<boolean>((resume) => {
    const socket = createConnection({ path })
    socket.once('connect', () => {
      socket.destroy()
      resume(Effect.succeed(true))
    })
    socket.once('error', () => resume(Effect.succeed(false)))
  })

/** Whether the process of that id still runs. */
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // SAFETY: `process.kill` throws Node's system errors, which carry a `code`.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Takes the folder for this process: writes its id into the lock file, created only if there is
 * none. A lock left by a process that ended is taken over. Returns the id of the process that
 * holds it when another does.
 */
const takeLock = (folder: string) => {
  const lock = lockOf(folder)
  for (;;) {
    try {
      const file = openSync(lock, 'wx', 0o600)
      writeSync(file, String(process.pid))
      closeSync(file)
      return undefined
    } catch (error) {
      // SAFETY: `openSync` throws Node's system errors, which carry a `code`.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const holder = Number(readFileSync(lock, 'utf8').trim())
      if (Number.isInteger(holder) && holder > 0 && alive(holder)) return holder
      rmSync(lock, { force: true })
    }
  }
}

/** The files PGlite reads beside its code: there, or beside the executable `bun build` makes. */
const artifact = (name: string) =>
  fileURLToPath(import.meta.url).startsWith('/$bunfs/')
    ? pathToFileURL(join(dirname(process.execPath), 'pglite', name))
    : new URL(name, import.meta.resolve('@electric-sql/pglite'))

/** An extension of PGlite, read from where `artifact` finds its files. */
const extension = (name: string, made: typeof unaccent) => ({
  ...made,
  setup: async () => ({ bundlePath: artifact(`${name}.tar.gz`) }),
})

/** PGlite on the folder, with the extensions the migrations create. */
const open = (folder: string) =>
  Effect.promise(async () => {
    const [wasm, initdb, bundle] = await Promise.all([
      readFile(artifact('pglite.wasm')),
      readFile(artifact('initdb.wasm')),
      readFile(artifact('pglite.data')),
    ])
    return PGlite.create(dataOf(folder), {
      pgliteWasmModule: await WebAssembly.compile(wasm),
      initdbWasmModule: await WebAssembly.compile(initdb),
      fsBundle: new Blob([bundle]),
      extensions: {
        unaccent: extension('unaccent', unaccent),
        pg_trgm: extension('pg_trgm', pg_trgm),
      },
    })
  })

/** What the client asked for when it connected, past those PGlite has no use of. */
const RESERVED = ['user', 'database', 'options', 'replication', 'client_encoding']

/**
 * The settings of a startup message, as names and values one after the other: PGlite answers the
 * message but ignores them, so they are made in the session when the client connects.
 */
const settingsOf = (message: Uint8Array) => {
  const words = new TextDecoder().decode(message.subarray(8)).split('\0')
  const settings: Array<readonly [string, string]> = []
  for (let at = 0; at + 1 < words.length && words[at] !== ''; at += 2)
    if (!RESERVED.includes(words[at] ?? '')) settings.push([words[at] ?? '', words[at + 1] ?? ''])
  return settings
}

const SSL_REQUEST = 80_877_103
const CANCEL_REQUEST = 80_877_102
const SYNC = new Uint8Array([0x53, 0, 0, 0, 4])

/** Whether the answer ends with `ReadyForQuery` saying the session is idle. */
const idle = (answer: Uint8Array) =>
  answer.length >= 6 && answer[answer.length - 6] === 0x5a && answer[answer.length - 1] === 0x49

/**
 * Serves the session of `db` on the socket at `path`, one connection at a time, as the comment of
 * this module says. Returns the function that stops serving.
 */
const serve = (db: PGlite, path: string) =>
  Effect.callback<() => Promise<void>>((resume) => {
    let holder: Socket | undefined
    const waiting: Array<() => void> = []
    const take = (socket: Socket) =>
      new Promise<void>((taken) => {
        const give = () => {
          holder = socket
          taken()
        }
        if (holder === undefined || holder === socket) give()
        else waiting.push(give)
      })
    const release = () => {
      holder = undefined
      waiting.shift()?.()
    }
    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      let pending = Buffer.alloc(0)
      let started = false
      let turn = Promise.resolve()
      const answer = async (
        message: Uint8Array,
        settings: ReadonlyArray<readonly [string, string]> = [],
      ) => {
        await take(socket)
        const answered = await db.execProtocolRaw(message)
        if (settings.length > 0)
          await db.query(
            'SELECT set_config(name, value, false) FROM unnest($1::text[], $2::text[]) AS s(name, value)',
            [settings.map(([name]) => name), settings.map(([, value]) => value)],
          )
        if (!socket.destroyed) socket.write(answered)
        if (idle(answered)) release()
      }
      socket.on('data', (data) => {
        pending = Buffer.concat([pending, data])
        for (;;) {
          if (!started) {
            if (pending.length < 8) return
            const length = pending.readInt32BE(0)
            const code = pending.readInt32BE(4)
            if (code === SSL_REQUEST) {
              socket.write('N')
              pending = pending.subarray(8)
              continue
            }
            // A connection that cancels another: PGlite has no process to signal.
            if (code === CANCEL_REQUEST) return void socket.destroy()
            if (pending.length < length) return
            started = true
            const message = new Uint8Array(pending.subarray(0, length))
            pending = pending.subarray(length)
            turn = turn.then(() => answer(message, settingsOf(message)))
            continue
          }
          if (pending.length < 5) return
          const length = 1 + pending.readInt32BE(1)
          if (pending.length < length) return
          const message = new Uint8Array(pending.subarray(0, length))
          pending = pending.subarray(length)
          // `Terminate`: the connection ends, and gives the session back below.
          if (message[0] === 0x58) return void socket.end()
          turn = turn.then(() => answer(message))
        }
      })
      socket.on('error', () => socket.destroy())
      socket.on('close', () => {
        sockets.delete(socket)
        // A connection gone in the middle of its turn: what it began is ended, and undone.
        turn = turn
          .catch(() => undefined)
          .then(async () => {
            if (holder !== socket) return
            await db.execProtocolRaw(SYNC)
            if (db.isInTransaction()) await db.exec('ROLLBACK')
            release()
          })
      })
    })
    rmSync(path, { force: true })
    server.once('error', (error) => resume(Effect.die(error)))
    server.listen(path, () =>
      resume(
        Effect.succeed(
          () =>
            new Promise<void>((closed) => {
              for (const socket of sockets) socket.destroy()
              server.close(() => closed())
            }),
        ),
      ),
    )
  })

/**
 * Opens the folder for this process, for as long as the scope lasts: PGlite on it, served on its
 * socket. Fails with `EmbeddedDatabaseBusy` when another process holds it.
 */
const hold = (folder: string) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      mkdirSync(folder, { recursive: true, mode: 0o700 })
      const holder = takeLock(folder)
      if (holder !== undefined) return yield* new EmbeddedDatabaseBusy({ folder, holder })
      const db = yield* open(folder).pipe(
        Effect.onError(() => Effect.sync(() => rmSync(lockOf(folder), { force: true }))),
      )
      const stop = yield* serve(db, socketOf(folder))
      return { db, stop }
    }),
    ({ db, stop }) =>
      Effect.promise(async () => {
        await stop()
        await db.close()
        rmSync(socketOf(folder), { force: true })
        rmSync(lockOf(folder), { force: true })
      }),
  )

/**
 * The socket of the database in `folder`, for as long as the scope lasts: the one of the process
 * that holds it, or, when none does, this process's own, which then holds it. With `own`, only
 * this process's own: the server never serves through a command that will end. Tries again for
 * `wait` while another process holds the folder, starting or ending.
 */
export const embeddedSocket = (
  folder: string,
  options: { readonly own: boolean; readonly wait: number },
) => {
  const path = socketOf(folder)
  return Effect.gen(function* () {
    if (!options.own && existsSync(path) && (yield* answers(path))) return path
    yield* hold(folder)
    return path
  }).pipe(
    Effect.retry({
      schedule: Schedule.spaced('200 millis'),
      times: Math.ceil(options.wait / 200),
    }),
  )
}
