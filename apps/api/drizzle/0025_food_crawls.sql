CREATE TYPE "public"."list_kind" AS ENUM('list', 'crawl');--> statement-breakpoint
ALTER TABLE "list_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "kind" "list_kind" DEFAULT 'list' NOT NULL;