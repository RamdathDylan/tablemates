ALTER TABLE "restaurants" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "utc_offset_minutes" integer;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "maps_url" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "neighborhood" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "details_fetched_at" timestamp (3) with time zone;