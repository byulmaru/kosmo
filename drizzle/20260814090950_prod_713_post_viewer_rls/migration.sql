ALTER TABLE "post" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "post_graphql_viewer_select" ON "post" AS PERMISSIVE FOR SELECT TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.profile AS author_profile
          INNER JOIN public.instance AS author_instance
            ON author_instance.id = author_profile.instance_id
          WHERE author_profile.id = "post"."profile_id"
            AND author_profile.state = 'ACTIVE'
            AND author_instance.state <> 'SUSPENDED'
            AND (
              (
                "post"."state" = 'ACTIVE'
                AND (
                  "post"."visibility" IN ('PUBLIC', 'UNLISTED')
                  OR "post"."profile_id" = public.kosmo_current_profile_id()
                  OR (
                    "post"."visibility" = 'FOLLOWERS'
                    AND EXISTS (
                      SELECT 1
                      FROM public.profile_follow AS established_follow
                      WHERE established_follow.follower_profile_id = public.kosmo_current_profile_id()
                        AND established_follow.followee_profile_id = "post"."profile_id"
                    )
                  )
                )
              )
              OR (
                "post"."state" = 'DELETED'
                AND "post"."profile_id" = public.kosmo_current_profile_id()
              )
            )
        )
      );--> statement-breakpoint
CREATE POLICY "post_graphql_author_insert" ON "post" AS PERMISSIVE FOR INSERT TO "kosmo_api" WITH CHECK ("post"."profile_id" = public.kosmo_current_profile_id());--> statement-breakpoint
CREATE POLICY "post_graphql_author_update" ON "post" AS PERMISSIVE FOR UPDATE TO "kosmo_api" USING ("post"."profile_id" = public.kosmo_current_profile_id()) WITH CHECK ("post"."profile_id" = public.kosmo_current_profile_id());--> statement-breakpoint
ALTER TABLE "post_content" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "post_content_graphql_viewer_select" ON "post_content" AS PERMISSIVE FOR SELECT TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.post AS parent_post
          WHERE parent_post.id = "post_content"."post_id"
        )
      );--> statement-breakpoint
CREATE POLICY "post_content_graphql_author_insert" ON "post_content" AS PERMISSIVE FOR INSERT TO "kosmo_api" WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.post AS parent_post
          WHERE parent_post.id = "post_content"."post_id"
            AND parent_post.profile_id = public.kosmo_current_profile_id()
        )
      );
