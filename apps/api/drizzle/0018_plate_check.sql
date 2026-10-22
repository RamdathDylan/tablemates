ALTER TYPE "public"."notification_type" ADD VALUE 'plate_prompt';--> statement-breakpoint
CREATE TABLE "plate_posts" (
	"prompt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"restaurant_id" uuid,
	"posted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"late" boolean NOT NULL,
	CONSTRAINT "plate_posts_prompt_id_user_id_pk" PRIMARY KEY("prompt_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plate_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timezone" text NOT NULL,
	"local_date" date NOT NULL,
	"prompt_at" timestamp (3) with time zone NOT NULL,
	"notified_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "plate_posts" ADD CONSTRAINT "plate_posts_prompt_id_plate_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."plate_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_posts" ADD CONSTRAINT "plate_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_posts" ADD CONSTRAINT "plate_posts_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plate_posts" ADD CONSTRAINT "plate_posts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plate_prompts_day_idx" ON "plate_prompts" USING btree ("timezone","local_date");