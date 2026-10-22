-- "Only me" means only me: private visits no longer carry tagged friends.
-- Removes existing companion links on private visits, and the "tagged" alerts
-- that pointed companions at them. Safe to run more than once.
-- "type" is compared as text: on a fresh database every migration runs in one
-- transaction, and Postgres rejects using an enum value ('tagged', added in
-- 0008) in the same transaction that added it.
DELETE FROM "notifications"
WHERE "type"::text = 'tagged'
  AND "visit_id" IN (SELECT "id" FROM "visits" WHERE "audience" = 'private');
--> statement-breakpoint
DELETE FROM "visit_companions"
WHERE "visit_id" IN (SELECT "id" FROM "visits" WHERE "audience" = 'private');
