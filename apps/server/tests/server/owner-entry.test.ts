import { spawnSync } from 'node:child_process'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { archiveEntry, readEntry, writeEntry } from '../../src/core/entries/index.ts'
import { Actor } from '../../src/core/events/index.ts'
import { ScratchDatabase, scratchDatabase } from '../../src/core/testing.ts'
import { defineType } from '../../src/core/types/index.ts'

const APP = new URL('../..', import.meta.url).pathname
const database = ManagedRuntime.make(
  Layer.merge(scratchDatabase, Layer.succeed(Actor, 'agent-kitchen')),
)
let url = ''

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
      yield* defineType({
        name: 'recipe',
        label: 'Recipe',
        description: 'A dish.',
        fields: [{ name: 'origin', kind: 'text' }],
      })
      yield* writeEntry({ type: 'person', title: 'Ada Lind' })
      yield* writeEntry({ type: 'person', title: 'Old Self' })
      yield* archiveEntry('old-self')
      yield* writeEntry({
        type: 'recipe',
        title: 'Leek Soup',
        fields: { origin: 'A market in spring.' },
        provenance: { origin: 'inferred' },
      })
      return (yield* ScratchDatabase).url
    }),
  )
})

afterAll(() => database.dispose())

describe('owner:entry names, prints and clears the entry that stands for the owner', () => {
  test('owner:entry alone says there is none yet, and how to name one', () => {
    expect(cli('owner:entry')).toEqual({
      status: 0,
      out: 'The owner has no entry: name the one that stands for you with `owner:entry <slug or id>`.',
      error: '',
    })
  })

  test('supposed:confirm without --as and without an owner entry says how to name one', () => {
    expect(cli('supposed:confirm', 'leek-soup', 'origin')).toEqual({
      status: 1,
      out: '',
      error:
        'Say who confirms with `--as <slug of your entry>`, or name the entry that stands for you once, with `owner:entry <slug or id>`; `--as owner` cites you with no entry.',
    })
  })

  test('owner:entry with an entry names it, and owner:entry alone then prints it', () => {
    expect(cli('owner:entry', 'ada-lind')).toMatchObject({
      status: 0,
      out: 'The owner entry is ada-lind (Ada Lind).',
    })
    expect(cli('owner:entry').out).toBe('The owner entry is ada-lind (Ada Lind).')
  })

  test('supposed:confirm without --as cites the owner entry', async () => {
    expect(cli('supposed:confirm', 'leek-soup', 'origin')).toMatchObject({
      status: 0,
      out: 'Confirmed: the origin of leek-soup is known, said by you.',
    })
    expect((await database.runPromise(readEntry('leek-soup'))).entry.sources).toMatchObject([
      { slug: 'ada-lind' },
    ])
  })

  test('an entry that does not exist or is archived is refused, saying what to fix', () => {
    expect(cli('owner:entry', 'nobody')).toMatchObject({
      status: 1,
      error:
        'The entry `nobody` does not exist: name the entry that stands for you, by its slug or id.',
    })
    expect(cli('owner:entry', 'old-self')).toMatchObject({
      status: 1,
      error: 'The entry `old-self` is archived: name an entry that is not.',
    })
    expect(cli('owner:entry', 'ada-lind', '--clear')).toMatchObject({
      status: 1,
      error: 'Give an entry or `--clear`, not both.',
    })
    expect(cli('owner:entry').out).toBe('The owner entry is ada-lind (Ada Lind).')
  })

  test('owner:entry --clear leaves the owner without an entry', () => {
    expect(cli('owner:entry', '--clear')).toMatchObject({
      status: 0,
      out: 'The owner has no entry now.',
    })
    expect(cli('owner:entry').out).toBe(
      'The owner has no entry: name the one that stands for you with `owner:entry <slug or id>`.',
    )
  })
})
