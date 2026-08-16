DROP POLICY "post_content_graphql_viewer_select" ON "post_content";--> statement-breakpoint
DROP POLICY "post_content_graphql_transition_all" ON "post_content";--> statement-breakpoint
ALTER TABLE "post_content" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "post_graphql_viewer_select" ON "post";--> statement-breakpoint
DROP POLICY "post_graphql_transition_all" ON "post";--> statement-breakpoint
ALTER TABLE "post" DISABLE ROW LEVEL SECURITY;
