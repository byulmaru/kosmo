import '@kosmo/core/polyfill';

import { removeInboundFollow } from '@kosmo/core/services';
import { resolveInboundFollowResponseProjection } from './inbound-follow-response';
import type { InboxContext } from '@fedify/fedify';
import type { Reject } from '@fedify/vocab';

export const handleInboundRejectFollow = async (
  context: InboxContext<void>,
  reject: Reject,
): Promise<void> => {
  const receivedAt = Temporal.Now.instant();
  const projection = await resolveInboundFollowResponseProjection(context, reject);
  if (
    !projection ||
    Temporal.Instant.compare(reject.published ?? receivedAt, projection.createdAt) < 0
  ) {
    return;
  }

  await removeInboundFollow({
    expectedRowId: projection.id,
    followeeProfileId: projection.followeeProfileId,
    followerProfileId: projection.followerProfileId,
  });
};
