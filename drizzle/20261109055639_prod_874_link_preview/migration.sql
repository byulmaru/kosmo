CREATE TABLE "link_preview" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"url_hash" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"last_successful_fetch_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "link_preview_url_hash_unique" ON "link_preview" ("url_hash");