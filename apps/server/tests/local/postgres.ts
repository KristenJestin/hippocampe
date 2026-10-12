import { Effect, Exit, Scope } from 'effect'
import { postgresBinaries, postgresOn } from '../../src/local/postgres.ts'

/** Runs a scoped effect in a scope of its own, which the test closes with `release`. */
const held = async <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) => {
  const scope = Effect.runSync(Scope.make())
  const value = await Effect.runPromise(Scope.provide(scope)(effect))
  return { value, release: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
}

/** The binaries of the package, ready to run, until `release`. */
export const binariesForTests = async () => {
  const { value, release } = await held(postgresBinaries)
  return { ...value, release }
}

/** The PostgreSQL of the local mode on `folder`, as the server runs it, until `release`. */
export const postgresForTests = (folder: string) => held(postgresOn(folder, false))
