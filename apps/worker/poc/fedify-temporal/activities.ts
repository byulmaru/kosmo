import type { FedifyTemporalMessageEnvelope } from './message';
import type { TemporalFedifyQueue } from './queue';

export type FedifyTemporalActivities = Readonly<{
  processFedifyMessage(envelope: FedifyTemporalMessageEnvelope): Promise<void>;
}>;

/** Bind the handler captured by `TemporalFedifyQueue.listen()` to a Worker Activity. */
export const createFedifyTemporalActivities = (
  queue: TemporalFedifyQueue,
): FedifyTemporalActivities => ({
  processFedifyMessage: (envelope) => queue.process(envelope),
});
