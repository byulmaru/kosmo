import { dayjs } from '@kosmo/dayjs';
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
import { TimelineManager } from '@kosmo/manager';
import { and, eq, gt } from 'drizzle-orm';
import { TimelineService } from '..';
import { defineService } from '../define';

type DistributeParams = {
  postId: string;
};

export const distribute = defineService(
  'timeline:distribute',
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
        instance: {
          id: Instances.id,
          type: Instances.type,
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

    const isLocalPost = post.instance.type === InstanceType.LOCAL;
    if (isLocalPost) {
      await TimelineManager.insert({ postId: post.id, profileId: post.profile.id });
    }

    const lastActivityThreshold = dayjs().subtract(7, 'day');

    const localProfileIds = new Set<string>();

    // 1. 멘션된 프로필 조회
    await db
      .select({ id: Profiles.id })
      .from(PostMentions)
      .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(PostMentions.postId, postId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.type, InstanceType.LOCAL),
          gt(Profiles.lastActivityAt, lastActivityThreshold),
        ),
      )
      .then((rows) => {
        rows.forEach((row) => localProfileIds.add(row.id));
      });

    // 2. 팔로워 프로필 조회 (DM 아닌 경우만)
    if (post.visibility !== PostVisibility.DIRECT) {
      await db
        .select({ id: Profiles.id })
        .from(ProfileFollows)
        .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ProfileFollows.targetProfileId, post.profile.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Instances.type, InstanceType.LOCAL),
            gt(Profiles.lastActivityAt, lastActivityThreshold),
          ),
        )
        .then((rows) => {
          rows.forEach((row) => localProfileIds.add(row.id));
        });
    }

    await TimelineService.insert.queueBulk(
      localProfileIds.values().map((profileId) => ({
        postId: post.id,
        profileId,
      })),
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) => `timeline:distribute:${input.postId}`,
        replace: true,
      },
    },
  },
);
