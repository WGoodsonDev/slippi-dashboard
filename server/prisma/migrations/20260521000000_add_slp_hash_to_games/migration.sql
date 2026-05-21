-- Add slp_hash column with a temporary default to handle any existing rows,
-- then drop the default so future inserts must provide a value explicitly.
ALTER TABLE "games" ADD COLUMN "slp_hash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "games" ALTER COLUMN "slp_hash" DROP DEFAULT;
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_slp_hash_key" UNIQUE("user_id", "slp_hash");
