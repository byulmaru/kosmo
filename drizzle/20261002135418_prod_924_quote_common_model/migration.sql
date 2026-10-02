CREATE TYPE "post_quote_consent_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_status" "post_quote_consent_status";--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "quote_consent_approval_uri" text;