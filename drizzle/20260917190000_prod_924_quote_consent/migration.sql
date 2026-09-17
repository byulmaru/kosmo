CREATE TYPE "post_quote_policy_value" AS ENUM('EVERYONE', 'FOLLOWERS', 'AUTHOR');--> statement-breakpoint
CREATE TYPE "post_quote_consent_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "post_quote_policy" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"policy" "post_quote_policy_value" DEFAULT 'EVERYONE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "post_quote_policy" ("post_id", "policy", "revision")
SELECT "post"."id", 'EVERYONE', 1
FROM "post"
INNER JOIN "profile" ON "profile"."id" = "post"."profile_id"
INNER JOIN "instance" ON "instance"."id" = "profile"."instance_id"
WHERE "instance"."kind" = 'LOCAL'
	AND "post"."state" = 'ACTIVE'
	AND "post"."current_content_id" IS NOT NULL
ON CONFLICT ("post_id") DO NOTHING;--> statement-breakpoint
CREATE TABLE "post_quote_consent" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_post_id" uuid NOT NULL,
	"quote_post_id" uuid,
	"quote_author_profile_id" uuid,
	"quote_author_actor_uri" text NOT NULL,
	"source_author_actor_uri" text NOT NULL,
	"source_uri" text NOT NULL,
	"quote_uri" text NOT NULL,
	"request_uri" text NOT NULL,
	"approval_uri" text,
	"status" "post_quote_consent_status" NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_quote_consent_request_uri_key" UNIQUE("request_uri"),
	CONSTRAINT "post_quote_consent_approval_uri_key" UNIQUE("approval_uri"),
	CONSTRAINT "post_quote_consent_source_post_id_quote_uri_quote_author_actor_uri_unique" UNIQUE("source_post_id","quote_uri","quote_author_actor_uri")
);--> statement-breakpoint
ALTER TABLE "post_quote_policy" ADD CONSTRAINT "post_quote_policy_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_quote_consent" ADD CONSTRAINT "post_quote_consent_source_post_id_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_quote_consent" ADD CONSTRAINT "post_quote_consent_quote_post_id_post_id_fkey" FOREIGN KEY ("quote_post_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_quote_consent" ADD CONSTRAINT "post_quote_consent_quote_author_profile_id_profile_id_fkey" FOREIGN KEY ("quote_author_profile_id") REFERENCES "public"."profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_quote_consent_source_post_id_index" ON "post_quote_consent" USING btree ("source_post_id");--> statement-breakpoint
CREATE INDEX "post_quote_consent_quote_post_id_index" ON "post_quote_consent" USING btree ("quote_post_id");--> statement-breakpoint
CREATE INDEX "post_quote_consent_approval_uri_index" ON "post_quote_consent" USING btree ("approval_uri");
--> statement-breakpoint
CREATE TYPE "post_quote_effect_kind" AS ENUM('QUOTE_REQUEST', 'CONSENT_UPDATE', 'POLICY_UPDATE', 'SOURCE_REVOCATION', 'QUOTE_DECISION');--> statement-breakpoint
CREATE TYPE "post_quote_effect_receipt_status" AS ENUM('PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "post_quote_effect_receipt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"effect_key" text NOT NULL,
	"effect_kind" "post_quote_effect_kind" NOT NULL,
	"consent_id" uuid,
	"post_id" uuid,
	"source_post_id" uuid,
	"revision" integer NOT NULL,
	"request_uri" text,
	"approval_uri" text,
	"source_uri" text,
	"quote_uri" text,
	"source_author_actor_uri" text,
	"quote_author_actor_uri" text,
	"target_inbox_uri" text,
	"target_shared_inbox_uri" text,
	"status" "post_quote_effect_receipt_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "post_quote_effect_receipt_effect_key_key" UNIQUE("effect_key")
);--> statement-breakpoint
ALTER TABLE "post_quote_effect_receipt" ADD CONSTRAINT "post_quote_effect_receipt_consent_id_post_quote_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "public"."post_quote_consent"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_quote_effect_receipt" ADD CONSTRAINT "post_quote_effect_receipt_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_quote_effect_receipt" ADD CONSTRAINT "post_quote_effect_receipt_source_post_id_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_quote_effect_receipt_status_created_at_index" ON "post_quote_effect_receipt" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX "post_quote_effect_receipt_consent_id_index" ON "post_quote_effect_receipt" USING btree ("consent_id");
