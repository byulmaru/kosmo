import { createProfileFollow } from '@kosmo/core/services';
import type { FollowRequestActionPorts } from '@kosmo/core/services';

export const materializeInboundFollowRequest = ({
  followerProfileId,
  followeeProfileId,
  activityId,
  actorId,
  objectId,
  ports,
}: {
  followerProfileId: string;
  followeeProfileId: string;
  activityId: URL;
  actorId: URL;
  objectId: URL;
  ports?: FollowRequestActionPorts;
}) =>
  createProfileFollow(
    {
      followerProfileId,
      followeeProfileId,
      source: { kind: 'activitypub', activityId, actorId, objectId },
    },
    ports,
  );
