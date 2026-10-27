CREATE TABLE "account_metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"account_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_metadata_account_id_key_unique" UNIQUE("account_id","key")
);
--> statement-breakpoint
ALTER TABLE "account_metadata" ADD CONSTRAINT "account_metadata_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;