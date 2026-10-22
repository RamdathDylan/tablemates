-- "Only me" means only me: private visits no longer carry tagged friends.
-- Removes existing companion links on private visits, and the "tagged" alerts
-- that pointed companions at them. Safe to run more than once.
DELETE FROM "notifications"
WHERE "type" = 'tagged'
  AND "visit_id" IN (SELECT "id" FROM "visits" WHERE "audience" = 'private');
--> statement-breakpoint
DELETE FROM "visit_companions"
WHERE "visit_id" IN (SELECT "id" FROM "visits" WHERE "audience" = 'private');
