DROP INDEX IF EXISTS "traits_profile_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "traits_profile_key_idx" ON "traits" USING btree ("profile_id","key");