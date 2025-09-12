import { db, firstOrThrow, PostMentions, Posts, ProfileFollows, Profiles } from '@kosmo/db';
import { PostState, PostVisibility, ProfileProtocol, ProfileState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
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
      .where(eq(Posts.id, postId))
      .then(firstOrThrow);

    if (post.state !== PostState.ACTIVE || post.profile.state !== ProfileState.ACTIVE) {
      return;
    }

    const targets = new Set<{
      inboxUrl: string;
      sharedInboxUrl: string | null;
      uri: string;
    }>();

    // 1. 멘션된 프로필 조회
    await db
      .select({
        inboxUrl: Profiles.inboxUrl,
        sharedInboxUrl: Profiles.sharedInboxUrl,
        uri: Profiles.uri,
      })
      .from(PostMentions)
      .innerJoin(Profiles, eq(Profiles.id, PostMentions.profileId))
      .where(
        and(
          eq(PostMentions.postId, postId),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Profiles.protocol, ProfileProtocol.ACTIVITYPUB),
        ),
      )
      .then((rows) => {
        rows.forEach((row) => {
          if (row.uri && row.inboxUrl) {
            targets.add({
              uri: row.uri,
              inboxUrl: row.inboxUrl,
              sharedInboxUrl: row.sharedInboxUrl,
            });
          }
        });
      });

    // 2. 팔로워 프로필 조회 (DM 아닌 경우만)
    if (post.visibility !== PostVisibility.DIRECT) {
      await db
        .select({
          inboxUrl: Profiles.inboxUrl,
          sharedInboxUrl: Profiles.sharedInboxUrl,
          uri: Profiles.uri,
        })
        .from(ProfileFollows)
        .innerJoin(Profiles, eq(Profiles.id, ProfileFollows.profileId))
        .where(
          and(
            eq(ProfileFollows.targetProfileId, post.profile.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Profiles.protocol, ProfileProtocol.ACTIVITYPUB),
          ),
        )
        .then((rows) => {
          rows.forEach((row) => {
            if (row.uri && row.inboxUrl) {
              targets.add({
                uri: row.uri,
                inboxUrl: row.inboxUrl,
                sharedInboxUrl: row.sharedInboxUrl,
              });
            }
          });
        });
    }

    await ActivityPubService.sendNote.queueBulk(
      targets.values().map((recipient) => {
        return {
          postId: post.id,
          uri: recipient.uri,
          inboxUrl: recipient.inboxUrl,
          sharedInboxUrl: recipient.sharedInboxUrl,
        };
      }),
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) => `activitypub:distribute:${input.postId}`,
        replace: true,
      },
    },
  },
);
