import { proxyActivities, sleep } from '@temporalio/workflow';
import { fedifyTemporalActivityOptions } from './activity-options';
import type { FedifyTemporalActivities } from './activities';
import type { FedifyTemporalMessageEnvelope } from './message';

const { processFedifyMessage } = proxyActivities<FedifyTemporalActivities>(
  fedifyTemporalActivityOptions,
);

/**
 * Process a message without an ordering key.
 *
 * The enqueue adapter records the wall-clock availability time in the
 * envelope. Date.now() is replaced with Temporal's deterministic clock in a
 * Workflow isolate, so the delay is replay-safe.
 */
export async function fedifyMessageWorkflow(
  envelope: FedifyTemporalMessageEnvelope,
): Promise<void> {
  const delay = envelope.availableAt - Date.now();
  if (delay > 0) {
    await sleep(delay);
  }

  await processFedifyMessage(envelope);
}
