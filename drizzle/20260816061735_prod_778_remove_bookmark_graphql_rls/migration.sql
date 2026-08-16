DROP POLICY "bookmark_graphql_owner_select" ON "bookmark";--> statement-breakpoint
DROP POLICY "bookmark_graphql_owner_insert" ON "bookmark";--> statement-breakpoint
DROP POLICY "bookmark_graphql_owner_delete" ON "bookmark";--> statement-breakpoint
ALTER TABLE "bookmark" DISABLE ROW LEVEL SECURITY;