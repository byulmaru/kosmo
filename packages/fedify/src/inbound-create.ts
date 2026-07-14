import '@kosmo/core/polyfill';

import type { Create } from '@fedify/vocab';

export interface InboundCreateMaterializationInput {
  readonly activityId: string;
  readonly receivedAt: Temporal.Instant;
}

export const createInboundCreateMaterializationInput = (
  activity: Pick<Create, 'id'>,
  receivedAt = Temporal.Now.instant(),
): InboundCreateMaterializationInput | null => {
  if (!(activity.id instanceof URL) || !URL.canParse(activity.id.href)) {
    return null;
  }

  return {
    activityId: activity.id.href,
    receivedAt,
  };
};
