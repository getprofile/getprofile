CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"content" text NOT NULL,
	"type" text NOT NULL,
	"importance" real DEFAULT 0.5,
	"decay_factor" real DEFAULT 1,
	"source_message_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"request_id" text,
	"model" text,
	"processed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"summary" text,
	"summary_version" integer DEFAULT 0,
	"summary_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"key" text NOT NULL,
	"category" text,
	"value_type" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"confidence" real DEFAULT 0.5,
	"source" text,
	"source_message_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "traits" ADD CONSTRAINT "traits_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_profile_type_idx" ON "memories" USING btree ("profile_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_profile_importance_idx" ON "memories" USING btree ("profile_id","importance");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_profile_created_idx" ON "messages" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_external_id_idx" ON "profiles" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traits_profile_key_idx" ON "traits" USING btree ("profile_id","key");