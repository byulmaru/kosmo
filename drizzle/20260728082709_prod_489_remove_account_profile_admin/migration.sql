ALTER TABLE "account_profile" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "account_profile_role";--> statement-breakpoint
CREATE TYPE "account_profile_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
ALTER TABLE "account_profile" ALTER COLUMN "role" SET DATA TYPE "account_profile_role" USING "role"::"account_profile_role";