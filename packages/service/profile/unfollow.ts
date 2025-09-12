import { db, firstOrThrowWith, Profiles } from '@kosmo/db';
import { ProfileProtocol, ProfileState } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { UnrecoverableError } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { ActivityPubService } from '..';
import { defineService } from '../define';

type UnfollowParams = {
  actorProfileId: string;
  targetProfileId: string;
};

export const unfollow = defineService(
  'profile:unfollow',
  async ({ actorProfileId, targetProfileId }: UnfollowParams) => {
    const targetProfile = await db
      .select({
        id: Profiles.id,
        protocol: Profiles.protocol,
        uri: Profiles.uri,
        inboxUrl: Profiles.inboxUrl,
        instanceId: Profiles.instanceId,
      })
      .from(Profiles)
      .where(and(eq(Profiles.id, targetProfileId), eq(Profiles.state, ProfileState.ACTIVE)))
      .then(firstOrThrowWith(() => new UnrecoverableError('NOT_FOUND')));

    await db.transaction(async (tx) => {
      const unfollowSuccess = await ProfileManager.deleteFollow({
        tx,
        actorProfileId,
        targetProfileId: targetProfile.id,
      });

      if (unfollowSuccess && targetProfile.protocol === ProfileProtocol.ACTIVITYPUB) {
        await ActivityPubService.sendUndoFollow.queue({
          sender: { profileId: actorProfileId },
          recipient: {
            profileId: targetProfile.id,
            inboxUrl: targetProfile.inboxUrl!,
            uri: targetProfile.uri!,
            instanceId: targetProfile.instanceId,
          },
        });
      }
    });
  },
);
