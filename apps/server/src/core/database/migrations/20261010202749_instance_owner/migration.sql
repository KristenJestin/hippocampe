CREATE TABLE "instance_owner" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"entry_id" uuid NOT NULL,
	"updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_owner_one" CHECK (id = 1)
);
--> statement-breakpoint
ALTER TABLE "instance_owner" ADD CONSTRAINT "instance_owner_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id");