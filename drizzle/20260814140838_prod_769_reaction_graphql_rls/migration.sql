ALTER TABLE "reaction" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reaction_graphql_target_post_select" ON "reaction" AS PERMISSIVE FOR SELECT TO "kosmo_api" USING (
        EXISTS (
          SELECT 1
          FROM public.post AS target_post
          WHERE target_post.id = "reaction"."post_id"
        )
      );--> statement-breakpoint
CREATE POLICY "reaction_graphql_owner_select" ON "reaction" AS PERMISSIVE FOR SELECT TO "kosmo_api" USING ("reaction"."profile_id" = public.kosmo_current_profile_id());--> statement-breakpoint
CREATE POLICY "reaction_graphql_owner_insert" ON "reaction" AS PERMISSIVE FOR INSERT TO "kosmo_api" WITH CHECK (
        "reaction"."profile_id" = public.kosmo_current_profile_id()
        AND EXISTS (
          SELECT 1
          FROM public.post AS target_post
          WHERE target_post.id = "reaction"."post_id"
        )
      );--> statement-breakpoint
CREATE POLICY "reaction_graphql_owner_delete" ON "reaction" AS PERMISSIVE FOR DELETE TO "kosmo_api" USING ("reaction"."profile_id" = public.kosmo_current_profile_id());--> statement-breakpoint
CREATE POLICY "reaction_graphql_owner_lock" ON "reaction" AS PERMISSIVE FOR UPDATE TO "kosmo_api" USING ("reaction"."profile_id" = public.kosmo_current_profile_id()) WITH CHECK (false);