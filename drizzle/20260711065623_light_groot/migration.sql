CREATE TYPE "account_profile_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "account_state" AS ENUM('ACTIVE', 'DISABLED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "activitypub_actor_key_kind" AS ENUM('RSA_PKCS1_V1_5', 'ED25519');--> statement-breakpoint
CREATE TYPE "activitypub_actor_type" AS ENUM('PERSON');--> statement-breakpoint
CREATE TYPE "application_state" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "application_type" AS ENUM('CONFIDENTIAL', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "instance_kind" AS ENUM('LOCAL', 'ACTIVITYPUB');--> statement-breakpoint
CREATE TYPE "instance_state" AS ENUM('ACTIVE', 'UNRESPONSIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "media_source" AS ENUM('LOCAL', 'REMOTE');--> statement-breakpoint
CREATE TYPE "oauth_token_state" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "post_state" AS ENUM('ACTIVE', 'DELETED');--> statement-breakpoint
CREATE TYPE "post_visibility" AS ENUM('PUBLIC', 'UNLISTED', 'FOLLOWERS', 'DIRECT');--> statement-breakpoint
CREATE TYPE "profile_follow_policy" AS ENUM('OPEN', 'APPROVAL_REQUIRED');--> statement-breakpoint
CREATE TYPE "profile_state" AS ENUM('ACTIVE', 'DISABLED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "session_state" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "account_profile" (
	"id" uuid PRIMARY KEY,
	"account_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "account_profile_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_profile_account_id_profile_id_unique" UNIQUE("account_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY,
	"oidc_subject" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"state" "account_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activitypub_actor_key" (
	"id" uuid PRIMARY KEY,
	"activitypub_actor_id" uuid NOT NULL,
	"kind" "activitypub_actor_key_kind" NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"private_key_jwk" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activitypub_actor_key_activitypub_actor_id_kind_unique" UNIQUE("activitypub_actor_id","kind")
);
--> statement-breakpoint
CREATE TABLE "activitypub_actor" (
	"id" uuid PRIMARY KEY,
	"profile_id" uuid NOT NULL UNIQUE,
	"uri" text NOT NULL UNIQUE,
	"type" "activitypub_actor_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_authorization" (
	"id" uuid PRIMARY KEY,
	"application_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "application_authorization_application_id_account_id_profile_id_unique" UNIQUE("application_id","account_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" uuid PRIMARY KEY,
	"owner_account_id" uuid,
	"client_id" text NOT NULL UNIQUE,
	"client_secret_hash" text,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"scopes" text[] NOT NULL,
	"type" "application_type" NOT NULL,
	"state" "application_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY,
	"storage_key" text NOT NULL UNIQUE,
	"sha256" text,
	"mime_type" text NOT NULL,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance" (
	"id" uuid PRIMARY KEY,
	"domain" text NOT NULL UNIQUE,
	"canonical_origin" text,
	"kind" "instance_kind" NOT NULL,
	"state" "instance_state" DEFAULT 'ACTIVE'::"instance_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY,
	"source" "media_source" NOT NULL,
	"account_id" uuid,
	"profile_id" uuid NOT NULL,
	"original_file_id" uuid,
	"thumbnail_file_id" uuid,
	"remote_url" text,
	"remote_fetched_at" timestamp with time zone,
	"thumbhash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_code" (
	"id" uuid PRIMARY KEY,
	"code_hash" text NOT NULL UNIQUE,
	"application_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid,
	"redirect_uri" text NOT NULL,
	"scopes" text[] NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" uuid PRIMARY KEY,
	"access_token_hash" text NOT NULL UNIQUE,
	"refresh_token_hash" text UNIQUE,
	"application_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_id" uuid,
	"scopes" text[] NOT NULL,
	"state" "oauth_token_state" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_content" (
	"id" uuid PRIMARY KEY,
	"post_id" uuid NOT NULL,
	"body_text" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"body_html" text,
	"spoiler_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" uuid PRIMARY KEY,
	"profile_id" uuid NOT NULL,
	"visibility" "post_visibility" NOT NULL,
	"state" "post_state" NOT NULL,
	"current_content_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_follow_request" (
	"id" uuid PRIMARY KEY,
	"follower_profile_id" uuid NOT NULL,
	"followee_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_follow_request_follower_profile_id_followee_profile_id_unique" UNIQUE("follower_profile_id","followee_profile_id")
);
--> statement-breakpoint
CREATE TABLE "profile_follow" (
	"id" uuid PRIMARY KEY,
	"follower_profile_id" uuid NOT NULL,
	"followee_profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_follow_follower_profile_id_followee_profile_id_unique" UNIQUE("follower_profile_id","followee_profile_id")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY,
	"instance_id" uuid NOT NULL,
	"state" "profile_state" DEFAULT 'ACTIVE'::"profile_state" NOT NULL,
	"handle" text NOT NULL,
	"normalized_handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"follow_policy" "profile_follow_policy" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_instance_id_normalized_handle_unique" UNIQUE("instance_id","normalized_handle")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY,
	"account_id" uuid NOT NULL,
	"application_id" uuid,
	"active_profile_id" uuid,
	"oidc_session_key" text,
	"token" text NOT NULL UNIQUE,
	"state" "session_state" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_profile_account_id_index" ON "account_profile" ("account_id");--> statement-breakpoint
CREATE INDEX "account_profile_profile_id_index" ON "account_profile" ("profile_id");--> statement-breakpoint
CREATE INDEX "application_authorization_account_id_index" ON "application_authorization" ("account_id");--> statement-breakpoint
CREATE INDEX "application_authorization_application_id_index" ON "application_authorization" ("application_id");--> statement-breakpoint
CREATE INDEX "application_owner_account_id_index" ON "application" ("owner_account_id");--> statement-breakpoint
CREATE INDEX "instance_kind_state_index" ON "instance" ("kind","state");--> statement-breakpoint
CREATE INDEX "media_account_id_index" ON "media" ("account_id");--> statement-breakpoint
CREATE INDEX "media_profile_id_index" ON "media" ("profile_id");--> statement-breakpoint
CREATE INDEX "media_remote_url_index" ON "media" ("remote_url");--> statement-breakpoint
CREATE INDEX "oauth_authorization_code_application_id_index" ON "oauth_authorization_code" ("application_id");--> statement-breakpoint
CREATE INDEX "oauth_authorization_code_expires_at_index" ON "oauth_authorization_code" ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_token_account_id_index" ON "oauth_token" ("account_id");--> statement-breakpoint
CREATE INDEX "oauth_token_application_id_index" ON "oauth_token" ("application_id");--> statement-breakpoint
CREATE INDEX "oauth_token_state_expires_at_index" ON "oauth_token" ("state","expires_at");--> statement-breakpoint
CREATE INDEX "post_content_post_id_index" ON "post_content" ("post_id");--> statement-breakpoint
CREATE INDEX "post_profile_id_id_index" ON "post" ("profile_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "profile_follow_request_followee_profile_id_index" ON "profile_follow_request" ("followee_profile_id");--> statement-breakpoint
CREATE INDEX "profile_follow_request_follower_profile_id_index" ON "profile_follow_request" ("follower_profile_id");--> statement-breakpoint
CREATE INDEX "profile_follow_followee_profile_id_index" ON "profile_follow" ("followee_profile_id");--> statement-breakpoint
CREATE INDEX "profile_follow_follower_profile_id_index" ON "profile_follow" ("follower_profile_id");--> statement-breakpoint
CREATE INDEX "session_account_id_index" ON "session" ("account_id");--> statement-breakpoint
ALTER TABLE "account_profile" ADD CONSTRAINT "account_profile_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_profile" ADD CONSTRAINT "account_profile_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activitypub_actor_key" ADD CONSTRAINT "activitypub_actor_key_3AGM4mAJxly8_fkey" FOREIGN KEY ("activitypub_actor_id") REFERENCES "activitypub_actor"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activitypub_actor" ADD CONSTRAINT "activitypub_actor_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_authorization" ADD CONSTRAINT "application_authorization_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_authorization" ADD CONSTRAINT "application_authorization_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "application_authorization" ADD CONSTRAINT "application_authorization_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_owner_account_id_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "account"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_original_file_id_file_id_fkey" FOREIGN KEY ("original_file_id") REFERENCES "file"("id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_thumbnail_file_id_file_id_fkey" FOREIGN KEY ("thumbnail_file_id") REFERENCES "file"("id");--> statement-breakpoint
ALTER TABLE "oauth_authorization_code" ADD CONSTRAINT "oauth_authorization_code_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_authorization_code" ADD CONSTRAINT "oauth_authorization_code_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_authorization_code" ADD CONSTRAINT "oauth_authorization_code_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "post_content" ADD CONSTRAINT "post_content_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_profile_id_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_current_content_id_post_content_id_fkey" FOREIGN KEY ("current_content_id") REFERENCES "post_content"("id");--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD CONSTRAINT "profile_follow_request_follower_profile_id_profile_id_fkey" FOREIGN KEY ("follower_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD CONSTRAINT "profile_follow_request_followee_profile_id_profile_id_fkey" FOREIGN KEY ("followee_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_follow" ADD CONSTRAINT "profile_follow_follower_profile_id_profile_id_fkey" FOREIGN KEY ("follower_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile_follow" ADD CONSTRAINT "profile_follow_followee_profile_id_profile_id_fkey" FOREIGN KEY ("followee_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_instance_id_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance"("id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_account_id_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_application_id_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_profile_id_profile_id_fkey" FOREIGN KEY ("active_profile_id") REFERENCES "profile"("id");