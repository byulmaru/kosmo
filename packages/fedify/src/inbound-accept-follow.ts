import { acceptProfileFollowRequest } from '@kosmo/core/services';
import { resolveInboundFollowResponseProjection } from './inbound-follow-response';
import type { InboxContext } from '@fedify/fedify';
import type { Accept } from '@fedify/vocab';

export const handleInboundAcceptFollow = async (
  context: InboxContext<void>,
  accept: Accept,
): Promise<void> => {
  const projection = await resolveInboundFollowResponseProjection(context, accept);
  if (!projection) {
    return;
  }

  await acceptProfileFollowRequest({
    expectedRowId: projection.id,
    followeeProfileId: projection.followeeProfileId,
    followerProfileId: projection.followerProfileId,
  });
};
