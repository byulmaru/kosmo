import { db, firstOrThrowWith, Instances, ProfileFollowRequests, Profiles } from '@kosmo/db';
import { ProfileProtocol } from '@kosmo/enum';
import { ProfileManager } from '@kosmo/manager';
import { UnrecoverableError } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ActivityPubService } from '..';
import { defineService } from '../define';

type FollowRequestAcceptParams = { targetProfileId: string } & (
  | {
      actorProfileId: string;
    }
  | { followRequestId: string }
);

export const followRequestAccept = defineService(
  'profile:followRequest:Accept',
  async (params: FollowRequestAcceptParams) => {
    const ActorProfiles = alias(Profiles, 'actor_profiles');
    const TargetProfiles = alias(Profiles, 'target_profiles');

    const followRequest = await db
      .select({
        id: ProfileFollowRequests.id,
        actorProfile: {
          id: ActorProfiles.id,
          protocol: ActorProfiles.protocol,
          uri: TargetProfiles.uri,
          inboxUrl: TargetProfiles.inboxUrl,
          instanceId: TargetProfiles.instanceId,
        },
        targetProfile: {
          id: TargetProfiles.id,
          protocol: TargetProfiles.protocol,
          webDomain: Instances.webDomain,
        },
      })
      .from(ProfileFollowRequests)
      .innerJoin(ActorProfiles, eq(ActorProfiles.id, ProfileFollowRequests.profileId))
      .innerJoin(Instances, eq(Instances.id, ActorProfiles.instanceId))
      .innerJoin(TargetProfiles, eq(TargetProfiles.id, ProfileFollowRequests.targetProfileId))
      .where(
        and(
          'followRequestId' in params
            ? eq(ProfileFollowRequests.id, params.followRequestId)
            : eq(ProfileFollowRequests.profileId, params.actorProfileId),
          eq(ProfileFollowRequests.targetProfileId, params.targetProfileId),
        ),
      )
      .then(firstOrThrowWith(() => new UnrecoverableError('NOT_FOUND')));

    await db.transaction(async (tx) => {
      await ProfileManager.deleteFollowRequest({
        tx,
        id: followRequest.id,
      });

      const followSuccess = await ProfileManager.createFollow({
        tx,
        actorProfileId: followRequest.actorProfile.id,
        targetProfileId: followRequest.targetProfile.id,
      });

      if (followSuccess && followRequest.actorProfile.protocol === ProfileProtocol.ACTIVITYPUB) {
        await ActivityPubService.sendAcceptFollow.queue({
          sender: {
            profileId: followRequest.targetProfile.id,
            webDomain: followRequest.targetProfile.webDomain!,
          },
          recipient: {
            profileId: followRequest.actorProfile.id,
            instanceId: followRequest.actorProfile.instanceId,
            inboxUrl: followRequest.actorProfile.inboxUrl!,
            uri: followRequest.actorProfile.uri!,
          },
        });
      }
    });
  },
);
