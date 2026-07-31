ALTER TABLE "media" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "storage_reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "upload_expires_at" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_remote_url_unique" ON "media" ("url") WHERE "source" = 'REMOTE';--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_source_state_fields_check" CHECK (
        (
          "source" = 'LOCAL'
          AND "account_id" IS NOT NULL
          AND "storage_reference" IS NOT NULL
          AND "upload_expires_at" IS NOT NULL
          AND (
            (
              "state" = 'UPLOADING'
              AND "media_type" IS NULL
              AND "url" IS NULL
              AND "ready_at" IS NULL
            )
            OR (
              "state" = 'READY'
              AND "media_type" IS NOT NULL
              AND "url" IS NOT NULL
              AND "ready_at" IS NOT NULL
            )
          )
        )
        OR (
          "source" = 'REMOTE'
          AND "state" = 'READY'
          AND "account_id" IS NULL
          AND "storage_reference" IS NULL
          AND "upload_expires_at" IS NULL
          AND "url" IS NOT NULL
          AND "ready_at" IS NULL
        )
      );