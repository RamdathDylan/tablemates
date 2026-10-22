ALTER TYPE "public"."notification_type" ADD VALUE 'friend_request';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'saved_place_reviewed';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "restaurant_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;