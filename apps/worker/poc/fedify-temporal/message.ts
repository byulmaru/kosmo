import type { MessageQueueEnqueueOptions } from '@fedify/fedify';

/**
 * The value sent across the Temporal payload boundary.
 *
 * Fedify's queue messages are plain JSON objects. Keeping the original value
 * under `message` makes the adapter usable with all three Fedify queue roles
 * without teaching the workflow about inbox, outbox, or fanout internals.
 */
export type FedifyTemporalMessageEnvelope = Readonly<{
  readonly id: string;
  readonly message: unknown;
  readonly availableAt: number;
}>;

/** Convert an installed Fedify delay into a non-negative millisecond count. */
export const durationToMilliseconds = (delay: MessageQueueEnqueueOptions['delay']): number => {
  if (delay == null) {
    return 0;
  }
  const milliseconds = delay.total({ unit: 'milliseconds' });
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError('Fedify Temporal message delay must be finite and non-negative');
  }
  return milliseconds;
};

export const createFedifyTemporalMessageEnvelope = (
  message: unknown,
  options: MessageQueueEnqueueOptions = {},
  nowEpochMs = Date.now(),
): FedifyTemporalMessageEnvelope => {
  const delayMs = durationToMilliseconds(options.delay);
  return {
    // This is a transport identity, separate from any ActivityPub `message.id`.
    id: crypto.randomUUID(),
    message,
    availableAt: nowEpochMs + delayMs,
  };
};
