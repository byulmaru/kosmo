import { getDatabaseConnection, Posts, withPrimaryDatabase } from '@kosmo/core/db';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { eq } from 'drizzle-orm';
import { capturePostHogEvent } from './posthog';
import type { PostAnalyticsPlatform } from '@kosmo/core/temporal/post-create';

export async function capturePostCreatedActivity({
  analyticsPlatform,
  postId,
}: {
  readonly analyticsPlatform: PostAnalyticsPlatform;
  readonly postId: string;
}): Promise<void> {
  if (process.env.ENVIRONMENT !== 'prod') {
    return;
  }

  const [post] = await withPrimaryDatabase(() =>
    getDatabaseConnection()
      .select({
        actorAccountId: Posts.actorAccountId,
        createdAt: Posts.createdAt,
        id: Posts.id,
        profileId: Posts.profileId,
        visibility: Posts.visibility,
      })
      .from(Posts)
      .where(eq(Posts.id, postId))
      .limit(1),
  );
  if (!post || post.actorAccountId === null) {
    return;
  }

  const accountId = encodeGlobalId('Account', post.actorAccountId);
  await capturePostHogEvent({
    event: 'post_created',
    distinct_id: accountId,
    timestamp: post.createdAt.toString(),
    uuid: post.id,
    properties: {
      $user_id: accountId,
      client_platform: analyticsPlatform,
      selected_profile_id: encodeGlobalId('Profile', post.profileId),
      visibility: post.visibility,
    },
  });
}
