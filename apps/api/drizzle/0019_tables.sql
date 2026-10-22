CREATE TYPE "public"."table_role" AS ENUM('owner', 'member');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'table_invite';--> statement-breakpoint
CREATE TABLE "table_members" (
	"table_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "table_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_members_table_id_user_id_pk" PRIMARY KEY("table_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '🍽️' NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "table_id" uuid;--> statement-breakpoint
ALTER TABLE "table_members" ADD CONSTRAINT "table_members_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_members" ADD CONSTRAINT "table_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_members_user_idx" ON "table_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;