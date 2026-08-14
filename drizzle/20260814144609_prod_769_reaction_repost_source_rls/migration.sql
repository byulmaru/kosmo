ALTER POLICY "reaction_graphql_target_post_select" ON "reaction" TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.post AS target_post
          WHERE target_post.id = "reaction"."post_id"
            AND (
              target_post.current_content_id IS NOT NULL
              OR target_post.repost_source_id IS NULL
              OR (
                target_post.current_content_id IS NULL
                AND target_post.reply_parent_id IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.post AS direct_source
                  WHERE direct_source.id = target_post.repost_source_id
                    AND direct_source.current_content_id IS NOT NULL
                )
              )
            )
        )
      );--> statement-breakpoint
ALTER POLICY "reaction_graphql_owner_insert" ON "reaction" TO "kosmo_api" WITH CHECK (
        "reaction"."profile_id" = public.kosmo_current_profile_id()
        AND EXISTS (
          SELECT 1
          FROM public.post AS target_post
          WHERE target_post.id = "reaction"."post_id"
            AND (
              target_post.current_content_id IS NOT NULL
              OR target_post.repost_source_id IS NULL
              OR (
                target_post.current_content_id IS NULL
                AND target_post.reply_parent_id IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.post AS direct_source
                  WHERE direct_source.id = target_post.repost_source_id
                    AND direct_source.current_content_id IS NOT NULL
                )
              )
            )
        )
      );