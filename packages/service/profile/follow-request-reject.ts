import { db, firstOrThrowWith, Instances, ProfileFollowRequests, Profiles } from '@kosmo/db';
import { ProfileProtocol } from '@kosmo/enum';
import { UnrecoverableError } from '@kosmo/error';
import { ProfileManager } from '@kosmo/manager';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ActivityPubService } from '..';
import { defineService } from '../define';

type FollowRequestRejectParams = {
  targetProfileId: string;
} & (
  | {
      actorProfileId: string;
    }
  | { followRequestId: string }
);

export const followRequestReject = defineService(
  'profile:followRequest:Reject',
  async (params: FollowRequestRejectParams) => {
    const ActorProfiles = alias(Profiles, 'actor_profiles');
    const TargetProfiles = alias(Profiles, 'target_profiles');

    const followRequest = await db
      .select({
        id: ProfileFollowRequests.id,
        actorProfile: {
          id: ActorProfiles.id,
          protocol: ActorProfiles.protocol,
          uri: ActorProfiles.uri,
          inboxUrl: ActorProfiles.inboxUrl,
          instanceId: ActorProfiles.instanceId,
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

      if (followRequest.actorProfile.protocol === ProfileProtocol.ACTIVITYPUB) {
        await ActivityPubService.sendRejectFollow.queue({
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
