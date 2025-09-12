import { db, firstOrThrowWith, Profiles } from '@kosmo/db';
import { ProfileFollowAcceptMode, ProfileProtocol, ProfileState } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { UnrecoverableError } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { ActivityPubService } from '..';
import { defineService } from '../define';

type FollowParams = {
  actorProfileId: string;
  targetProfileId: string;
};

export const follow = defineService(
  'profile:follow',
  async ({ actorProfileId, targetProfileId }: FollowParams) => {
    if (actorProfileId === targetProfileId) {
      throw new UnrecoverableError('SELF_FOLLOW');
    }

    const targetProfile = await db
      .select({
        id: Profiles.id,
        followAcceptMode: Profiles.followAcceptMode,
        protocol: Profiles.protocol,
        uri: Profiles.uri,
        inboxUrl: Profiles.inboxUrl,
        instanceId: Profiles.instanceId,
      })
      .from(Profiles)
      .where(and(eq(Profiles.id, targetProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .then(firstOrThrowWith(() => new UnrecoverableError('NOT_FOUND')));

    await db.transaction(async (tx) => {
      let followSuccess = false;

      followSuccess = await (
        targetProfile.followAcceptMode === ProfileFollowAcceptMode.AUTO
          ? ProfileManager.createFollow
          : ProfileManager.createFollowRequest
      )({
        tx,
        actorProfileId,
        targetProfileId: targetProfile.id,
      });

      if (followSuccess) {
        if (targetProfile.protocol === ProfileProtocol.ACTIVITYPUB) {
          ActivityPubService.sendFollow.queue({
            sender: { profileId: actorProfileId },
            recipient: {
              profileId: targetProfile.id,
              inboxUrl: targetProfile.inboxUrl!,
              uri: targetProfile.uri!,
              instanceId: targetProfile.instanceId,
            },
          });
        }
      }
    });

    return { followAcceptMode: targetProfile.followAcceptMode };
  },
);
