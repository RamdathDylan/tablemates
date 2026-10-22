ALTER TYPE "public"."notification_type" ADD VALUE 'tagged';--> statement-breakpoint
CREATE TABLE "visit_companions" (
	"visit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"linked_visit_id" uuid,
	CONSTRAINT "visit_companions_visit_id_user_id_pk" PRIMARY KEY("visit_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "visit_companions" ADD CONSTRAINT "visit_companions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_companions" ADD CONSTRAINT "visit_companions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_companions" ADD CONSTRAINT "visit_companions_linked_visit_id_visits_id_fk" FOREIGN KEY ("linked_visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_companions_user_idx" ON "visit_companions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;