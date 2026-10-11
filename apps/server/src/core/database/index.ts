/**
 * The PostgreSQL database of Hippocampe, as the entry points wire it: the connection from
 * `DATABASE_URL`, and its migrations. No table and no Drizzle handle: those stay in the core
 * (`tools/boundaries.ts` refuses any other module of this folder outside it).
 */
export {
  awaitDatabase,
  DatabaseUrlMissing,
  databaseReachable,
  databaseServices,
  DatabaseTwice,
  databaseUrl,
  layer,
  serverLayer,
} from './client.ts'
export { POSTGRES_MAJOR } from './embedded.ts'
export { latestVersion, migrate, MigrationsBehind, schemaVersion } from './migrate.ts'
