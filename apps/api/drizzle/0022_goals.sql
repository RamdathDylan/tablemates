ALTER TYPE "public"."notification_type" ADD VALUE 'goal_reached';--> statement-breakpoint
CREATE TABLE "goals" (
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"target_new_places" integer NOT NULL,
	"reached_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_user_id_year_pk" PRIMARY KEY("user_id","year")
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;