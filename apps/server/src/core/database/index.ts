/**
 * The PostgreSQL database of Hippocampe, as the entry points wire it: the connection from
 * `DATABASE_URL` or to the folder of `HIPPOCAMPE_DATABASE_DIR`, and its migrations. No table and
 * no Drizzle handle: those stay in the core (`tools/boundaries.ts` refuses any other module of
 * this folder outside it).
 */
export {
  awaitDatabase,
  DatabaseModesBoth,
  DatabaseUrlMissing,
  databaseReachable,
  databaseServices,
  databaseUrl,
  layer,
  localDatabaseFolder,
} from './client.ts'
export { latestVersion, migrate, MigrationsBehind, schemaVersion } from './migrate.ts'
