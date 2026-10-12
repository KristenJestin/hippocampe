CREATE TABLE "inbox_posts" (
	"item_id" uuid,
	"position" integer,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"answer" text,
	"copy" jsonb,
	"reason" text,
	"copied_at" timestamp with time zone,
	CONSTRAINT "inbox_posts_pkey" PRIMARY KEY("item_id","position"),
	CONSTRAINT "inbox_posts_status" CHECK (status IN ('pending', 'kept', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "inbox_posts" ADD CONSTRAINT "inbox_posts_item_id_inbox_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inbox"("id") ON DELETE CASCADE;