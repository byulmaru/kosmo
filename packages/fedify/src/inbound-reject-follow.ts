import '@kosmo/core/polyfill';

import { removeInboundFollow } from '@kosmo/core/services';
import type { OutboundProfileFollowProjection } from './inbound-follow-response';

export const handleInboundRejectFollow = async ({
  projection,
  publishedAt,
  receivedAt,
}: {
  projection: OutboundProfileFollowProjection;
  publishedAt: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
}): Promise<void> => {
  if (Temporal.Instant.compare(publishedAt ?? receivedAt, projection.createdAt) < 0) {
    return;
  }

  await removeInboundFollow({
    expectedRowId: projection.id,
    followeeProfileId: projection.followeeProfileId,
    followerProfileId: projection.followerProfileId,
  });
};
