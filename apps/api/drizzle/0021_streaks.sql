ALTER TYPE "public"."notification_type" ADD VALUE 'streak_nudge';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "count" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "streak_nudged_week" date;