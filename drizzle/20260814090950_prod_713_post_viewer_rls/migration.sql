ALTER TABLE "post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "post_graphql_viewer_select" ON "post" AS RESTRICTIVE FOR SELECT TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.profile AS author_profile
          INNER JOIN public.instance AS author_instance
            ON author_instance.id = author_profile.instance_id
          WHERE author_profile.id = "post"."profile_id"
            AND author_profile.state = 'ACTIVE'
            AND author_instance.state <> 'SUSPENDED'
            AND "post"."state" = 'ACTIVE'
            AND (
              "post"."visibility" IN ('PUBLIC', 'UNLISTED')
              OR "post"."profile_id" = public.kosmo_current_profile_id()
              OR (
                "post"."visibility" = 'FOLLOWERS'
                AND "post"."profile_id" IN (
                  SELECT established_follow.followee_profile_id
                  FROM public.profile_follow AS established_follow
                  WHERE established_follow.follower_profile_id = public.kosmo_current_profile_id()
                )
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "post_graphql_transition_all" ON "post" AS PERMISSIVE FOR ALL TO "kosmo_api" USING (true) WITH CHECK (true);--> statement-breakpoint
ALTER TABLE "post_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "post_content_graphql_viewer_select" ON "post_content" AS RESTRICTIVE FOR SELECT TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.post AS parent_post
          WHERE parent_post.id = "post_content"."post_id"
        )
      );--> statement-breakpoint
CREATE POLICY "post_content_graphql_transition_all" ON "post_content" AS PERMISSIVE FOR ALL TO "kosmo_api" USING (true) WITH CHECK (true);
