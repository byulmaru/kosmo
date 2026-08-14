ALTER TABLE "profile_follow_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "profile_follow_request_graphql_participant_select" ON "profile_follow_request" AS PERMISSIVE FOR SELECT TO "kosmo_api" USING (
        "profile_follow_request"."follower_profile_id" = public.kosmo_current_profile_id()
        OR "profile_follow_request"."followee_profile_id" = public.kosmo_current_profile_id()
      );--> statement-breakpoint
CREATE POLICY "profile_follow_request_graphql_follower_insert" ON "profile_follow_request" AS PERMISSIVE FOR INSERT TO "kosmo_api" WITH CHECK ("profile_follow_request"."follower_profile_id" = public.kosmo_current_profile_id());--> statement-breakpoint
CREATE POLICY "profile_follow_request_graphql_participant_delete" ON "profile_follow_request" AS PERMISSIVE FOR DELETE TO "kosmo_api" USING (
        "profile_follow_request"."follower_profile_id" = public.kosmo_current_profile_id()
        OR "profile_follow_request"."followee_profile_id" = public.kosmo_current_profile_id()
      );