CREATE TYPE "push_installation_platform" AS ENUM('ANDROID', 'IOS');--> statement-breakpoint
CREATE TABLE "push_installation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"installation_id" text NOT NULL UNIQUE,
	"account_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"platform" "push_installation_platform" NOT NULL,
	"token" text NOT NULL,
	"registration_epoch" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "push_installation_token_hash_unique" ON "push_installation" (sha256(replace("token", chr(92), chr(92) || chr(92))::bytea));--> statement-breakpoint
CREATE INDEX "push_installation_account_id_index" ON "push_installation" ("account_id");--> statement-breakpoint
CREATE INDEX "push_installation_session_id_index" ON "push_installation" ("session_id");--> statement-breakpoint
ALTER TABLE "push_installation" ADD CONSTRAINT "push_installation_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_installation" ADD CONSTRAINT "push_installation_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE;