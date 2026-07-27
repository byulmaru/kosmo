CREATE TYPE "media_state" AS ENUM('UPLOADING', 'READY');--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_original_file_id_file_id_fkey";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_thumbnail_file_id_file_id_fkey";--> statement-breakpoint
DELETE FROM "media";--> statement-breakpoint
DROP TABLE "file";--> statement-breakpoint
DROP INDEX "media_remote_url_index";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "state" "media_state" NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "storage_reference" text NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "upload_expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "original_file_id";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "thumbnail_file_id";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "remote_url";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "remote_fetched_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "thumbhash";--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_storage_reference_key" UNIQUE("storage_reference");
