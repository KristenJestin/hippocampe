ALTER TABLE "inbox" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_client_id_key" UNIQUE("client_id");