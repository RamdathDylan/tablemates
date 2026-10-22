CREATE TYPE "public"."challenge_member_status" AS ENUM('invited', 'joined');--> statement-breakpoint
CREATE TYPE "public"."challenge_metric" AS ENUM('new_places', 'cuisines', 'visits', 'reviews');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'challenge_invite';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'challenge_complete';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'challenge_ended';--> statement-breakpoint
CREATE TABLE "challenge_members" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "challenge_member_status" DEFAULT 'invited' NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"won" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_members_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"metric" "challenge_metric" NOT NULL,
	"target" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "challenge_id" uuid;--> statement-breakpoint
ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_members_user_idx" ON "challenge_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;