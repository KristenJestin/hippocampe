import { spawnSync } from 'node:child_process'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { archiveEntry, readEntry, writeEntry } from '../../src/core/entries/index.ts'
import { Actor, entryHistory } from '../../src/core/events/index.ts'
import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'
import { defineType } from '../../src/core/types/index.ts'

const APP = new URL('../..', import.meta.url).pathname
const database = ManagedRuntime.make(
  Layer.merge(scratchDatabase, Layer.succeed(Actor, 'agent-kitchen')),
)
let url = ''
let day = ''

/** Runs a command of the owner's command line on the suite's database. */
const cli = (...args: ReadonlyArray<string>) => {
  const run = spawnSync(process.execPath, ['src/cli.ts', ...args], {
    cwd: APP,
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '',
      DATABASE_URL: url,
      BETTER_AUTH_SECRET: 'a-secret-for-the-tests-only-0123456789abcdef',
    },
  })
  return { status: run.status, out: run.stdout.trim(), error: run.stderr.trim() }
}

beforeAll(async () => {
  url = await database.runPromise(
    Effect.gen(function* () {
      yield* defineType({ name: 'person', label: 'Person', description: 'A person.', fields: [] })
      yield* writeEntry({ type: 'person', title: 'Old Self' })
      const archived = yield* archiveEntry('old-self', 'Sold.')
      day = String(archived.archived_at).slice(0, 10)
      yield* writeEntry({ type: 'person', title: 'Ada Lind' })
      return (yield* ScratchDatabase).url
    }),
  )
})

afterAll(() => database.dispose())

describe('entry:unarchive brings an archived entry back, as the owner', () => {
  test('an entry that is not archived is refused in one sentence', () => {
    expect(cli('entry:unarchive', 'ada-lind')).toEqual({
      status: 1,
      out: '',
      error: 'The entry `ada-lind` is not archived: there is nothing to bring back.',
    })
  })

  test('an entry that does not exist is refused', () => {
    expect(cli('entry:unarchive', 'nobody')).toMatchObject({
      status: 1,
      error: 'The entry `nobody` does not exist.',
    })
  })

  test('an archived entry is brought back, said in one sentence, and recorded by the owner', async () => {
    expect(cli('entry:unarchive', 'old-self')).toEqual({
      status: 0,
      out: `The entry old-self is back: it was archived on ${day} ("Sold.").`,
      error: '',
    })
    expect((await database.runPromise(readEntry('old-self'))).entry).toMatchObject({
      archived_at: null,
      archived_reason: null,
    })
    expect((await database.runPromise(entryHistory('old-self'))).at(-1)).toMatchObject({
      actor: 'owner',
      action: 'archive',
      changes: [{ field: 'archived_at' }, { field: 'archived_reason' }],
    })
  })

  test('the entry brought back is written to again', async () => {
    await database.runPromise(
      writeEntry({ entry: 'old-self', summary: 'Back.', provenance: { summary: 'inferred' } }),
    )
    expect((await database.runPromise(readEntry('old-self'))).entry.summary).toBe('Back.')
  })
})
