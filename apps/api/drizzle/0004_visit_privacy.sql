CREATE TYPE "public"."visit_audience" AS ENUM('friends', 'close_friends', 'private');--> statement-breakpoint
CREATE TABLE "close_friends" (
	"owner_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "close_friends_owner_id_friend_id_pk" PRIMARY KEY("owner_id","friend_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_audience" "visit_audience" DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "audience" "visit_audience" DEFAULT 'friends' NOT NULL;--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "close_friends" ADD CONSTRAINT "close_friends_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;