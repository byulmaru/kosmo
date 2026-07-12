import type { FollowRequestService } from '@kosmo/core/follow-request';

export const materializeInboundFollowRequest = ({
  service,
  followerProfileId,
  followeeProfileId,
  activityId,
  actorId,
  objectId,
}: {
  service: FollowRequestService;
  followerProfileId: string;
  followeeProfileId: string;
  activityId: URL;
  actorId: URL;
  objectId: URL;
}) =>
  service.followProfile({
    followerProfileId,
    followeeProfileId,
    source: { kind: 'activitypub', activityId, actorId, objectId },
  });
