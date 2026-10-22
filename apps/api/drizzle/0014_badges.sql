ALTER TYPE "public"."notification_type" ADD VALUE 'badge';--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_key" text NOT NULL,
	"earned_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_key_pk" PRIMARY KEY("user_id","badge_key")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "badge_key" text;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;