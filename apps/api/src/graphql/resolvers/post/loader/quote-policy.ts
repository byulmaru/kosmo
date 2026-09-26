import { db, Instances, PostQuotePolicies, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostState, ProfileState } from '@kosmo/core/enums';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { UserContext } from '@/context';

type QuotePolicyRow = Readonly<{
  policy: typeof PostQuotePolicies.$inferSelect.policy | null;
  postId: string;
}>;

export const postQuotePolicyLoader = (ctx: UserContext) =>
  ctx.loader<string, QuotePolicyRow, string, true>({
    name: 'post.quotePolicy',
    nullable: true,
    load: (postIds) =>
      db
        .select({ postId: Posts.id, policy: PostQuotePolicies.policy })
        .from(Posts)
        .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(PostQuotePolicies, eq(PostQuotePolicies.postId, Posts.id))
        .where(
          and(
            inArray(Posts.id, postIds),
            eq(Instances.kind, InstanceKind.LOCAL),
            eq(Instances.state, InstanceState.ACTIVE),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Posts.state, PostState.ACTIVE),
            isNotNull(Posts.currentContentId),
          ),
        ),
    key: (row) => row?.postId ?? null,
  });
