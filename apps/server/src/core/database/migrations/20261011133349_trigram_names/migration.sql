-- A search compares the words no entry holds with the names of the entries, by trigrams.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "entries_names" ON "entries" USING gin ((slug || ' ' || title || ' ' || aliases::text) gin_trgm_ops);
