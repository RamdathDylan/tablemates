CREATE TABLE "review_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"rating" integer,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "review_dishes_rating_range" CHECK ("review_dishes"."rating" is null or "review_dishes"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "review_dishes" ADD CONSTRAINT "review_dishes_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_dishes_review_idx" ON "review_dishes" USING btree ("review_id");--> statement-breakpoint
-- Carry existing dish names over (unrated) before dropping the old column.
INSERT INTO "review_dishes" ("review_id", "name", "name_key", "position")
SELECT r."id", trim(d.name), trim(regexp_replace(regexp_replace(lower(d.name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')), d.ord - 1
FROM "reviews" r, unnest(r."dishes") WITH ORDINALITY AS d(name, ord)
WHERE trim(d.name) <> '';--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "dishes";