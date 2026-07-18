import { handleInboundAcceptFollow } from './inbound-accept-follow';
import { resolveInboundFollowResponseProjection } from './inbound-follow-response';
import type { InboxContext } from '@fedify/fedify';
import type { Accept } from '@fedify/vocab';

export const handleInboundAccept = async (
  context: InboxContext<void>,
  accept: Accept,
): Promise<void> => {
  const followProjection = await resolveInboundFollowResponseProjection(context, accept);
  if (followProjection) {
    await handleInboundAcceptFollow(followProjection);
  }
};
