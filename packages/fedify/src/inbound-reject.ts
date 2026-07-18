import '@kosmo/core/polyfill';

import { resolveInboundFollowResponseProjection } from './inbound-follow-response';
import { handleInboundRejectFollow } from './inbound-reject-follow';
import type { InboxContext } from '@fedify/fedify';
import type { Reject } from '@fedify/vocab';

export const handleInboundReject = async (
  context: InboxContext<void>,
  reject: Reject,
): Promise<void> => {
  const receivedAt = Temporal.Now.instant();
  const followProjection = await resolveInboundFollowResponseProjection(context, reject);
  if (followProjection) {
    await handleInboundRejectFollow({
      projection: followProjection,
      publishedAt: reject.published,
      receivedAt,
    });
  }
};
