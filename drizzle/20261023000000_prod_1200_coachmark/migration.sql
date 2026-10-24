CREATE TYPE "coachmark_guide" AS ENUM('TIMELINE', 'SEARCH', 'TAG', 'PROFILE', 'POST', 'COMPOSER');--> statement-breakpoint
CREATE TABLE "account_coachmark" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"guide" "coachmark_guide" NOT NULL,
	"first_shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_coachmark_account_id_guide_unique" UNIQUE("account_id","guide")
);
--> statement-breakpoint
ALTER TABLE "account_coachmark" ADD CONSTRAINT "account_coachmark_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;