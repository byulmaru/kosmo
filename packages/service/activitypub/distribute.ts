import {
  db,
  firstOrThrow,
  Instances,
  PostMentions,
  Posts,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { InstanceType, PostState, PostVisibility, ProfileState } from '@kosmo/enum';
import { and, eq, sql } from 'drizzle-orm';
import { ActivityPubService } from '..';
import { defineService } from '../define';

type DistributeParams = {
  postId: string;
};

export const distribute = defineService(
  'activitypub:distribute',
  async ({ postId }: DistributeParams) => {
    const post = await db
      .select({
        id: Posts.id,
        state: Posts.state,
        visibility: Posts.visibility,
        profile: {
          id: Profiles.id,
          state: Profiles.state,
        },
      })
      .from(Posts)
      .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(eq(Posts.id, postId))
      .then(firstOrThrow);

    if (post.state !== PostState.ACTIVE || post.profile.state !== ProfileState.ACTIVE) {
      return;
    }

    const targets = new Set<string>();

    // 1. 멘션된 프로필 조회
    await db
      .select({
        inboxUrl: sql<string | null>`COALESCE(${Profiles.sharedinboxUrl}, ${Profiles.inboxUrl})`,
        instanceId: Instances.id,
      })
      .from(PostMentions)
      .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(PostMentions.postId, postId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.type, InstanceType.ACTIVITYPUB),
        ),
      )
      .then((rows) => {
        rows
          .filter((row) => row.inboxUrl !== null)
          .forEach((row) => {
            targets.add(`${row.instanceId}:${row.inboxUrl}`);
          });
      });

    // 2. 팔로워 프로필 조회 (DM 아닌 경우만)
    if (post.visibility !== PostVisibility.DIRECT) {
      await db
        .select({
          inboxUrl: sql<string | null>`COALESCE(${Profiles.sharedinboxUrl}, ${Profiles.inboxUrl})`,
          instanceId: Instances.id,
        })
        .from(ProfileFollows)
        .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ProfileFollows.targetProfileId, post.profile.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Instances.type, InstanceType.ACTIVITYPUB),
          ),
        )
        .then((rows) => {
          rows
            .filter((row) => row.inboxUrl !== null)
            .forEach((row) => {
              targets.add(`${row.instanceId}:${row.inboxUrl}`);
            });
        });
    }

    await ActivityPubService.sendNote.queueBulk(
      targets.values().map((targetString) => {
        const [instanceId, inboxUrl] = targetString.split(':', 2);
        return {
          postId: post.id,
          profileId: post.profile.id,
          instanceId,
          inboxUrl,
        };
      }),
    );
  },
  {
    deduplicationKeyGenerator: (input) => `activitypub:distribute:${input.postId}`,
  },
);
