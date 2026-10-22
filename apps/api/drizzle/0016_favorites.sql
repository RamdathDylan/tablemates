CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"restaurant_id" uuid NOT NULL,
	CONSTRAINT "favorites_user_id_position_pk" PRIMARY KEY("user_id","position"),
	CONSTRAINT "favorites_position_range" CHECK ("favorites"."position" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_once_idx" ON "favorites" USING btree ("user_id","restaurant_id");