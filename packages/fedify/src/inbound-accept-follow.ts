import { acceptProfileFollowRequest } from '@kosmo/core/services';
import type { OutboundProfileFollowProjection } from './inbound-follow-response';

export const handleInboundAcceptFollow = async (
  projection: OutboundProfileFollowProjection,
): Promise<void> => {
  await acceptProfileFollowRequest({
    expectedRowId: projection.id,
    followeeProfileId: projection.followeeProfileId,
    followerProfileId: projection.followerProfileId,
  });
};
