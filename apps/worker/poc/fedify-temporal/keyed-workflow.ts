import {
  condition,
  continueAsNew,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { fedifyTemporalActivityOptions } from './activity-options';
import type { FedifyTemporalActivities } from './activities';
import type { FedifyTemporalMessageEnvelope } from './message';

/** The signal name is part of the adapter's Temporal wire contract. */
export const fedifyKeyedMessageSignal = defineSignal<[FedifyTemporalMessageEnvelope]>('enqueue');

export type FedifyKeyedMessageFailure = Readonly<{
  readonly id: string;
  readonly error: string;
}>;

export type FedifyKeyedMessageWorkflowResult = Readonly<{
  readonly orderingKey?: string;
  readonly processedCount: number;
  readonly failedCount: number;
  /** Exhausted messages from this Workflow run only. */
  readonly failures: readonly FedifyKeyedMessageFailure[];
}>;

export type FedifyKeyedMessageWorkflowInput = Readonly<{
  /** Only identifies the Signal-With-Start Workflow; processing uses envelopes. */
  readonly orderingKey?: string;
  readonly pending?: readonly FedifyTemporalMessageEnvelope[];
  readonly processedCount?: number;
  readonly failedCount?: number;
}>;

/**
 * A small deterministic bound keeps the PoC history finite even when a key
 * receives a sustained stream of messages. Pending messages and compact
 * counters are carried into the next run.
 */
export const FEDIFY_KEYED_CONTINUE_AS_NEW_AFTER = 100;

const { processFedifyMessage } = proxyActivities<FedifyTemporalActivities>(
  fedifyTemporalActivityOptions,
);

const readyIndex = (pending: readonly FedifyTemporalMessageEnvelope[], now: number): number =>
  pending.findIndex(({ availableAt }) => availableAt <= now);

/**
 * Process one ordering key at a time while allowing ready messages to pass a
 * delayed message. The signal handler is synchronous so a Continue-As-New
 * boundary cannot interrupt an async enqueue mutation.
 */
export async function fedifyKeyedMessageWorkflow(
  input: FedifyKeyedMessageWorkflowInput = {},
): Promise<FedifyKeyedMessageWorkflowResult> {
  const pending = [...(input.pending ?? [])];
  let processedCount = input.processedCount ?? 0;
  let failedCount = input.failedCount ?? 0;
  const failures: FedifyKeyedMessageFailure[] = [];
  let messagesSinceContinueAsNew = 0;

  setHandler(fedifyKeyedMessageSignal, (envelope) => {
    pending.push(envelope);
  });

  while (true) {
    if (pending.length === 0) {
      return {
        ...(input.orderingKey === undefined ? {} : { orderingKey: input.orderingKey }),
        processedCount,
        failedCount,
        failures,
      };
    }

    const now = Date.now();
    const index = readyIndex(pending, now);
    if (index < 0) {
      const waitUntil = pending.reduce(
        (earliest, { availableAt }) => Math.min(earliest, availableAt),
        Number.POSITIVE_INFINITY,
      );
      const observedPendingCount = pending.length;
      const waitMs = Math.max(1, waitUntil - now);

      // Wake both when the next delayed message becomes ready and when a
      // signal changes the pending set. The latter is needed when a newly
      // signalled item has an earlier availability time than the old head.
      await condition(
        () => pending.length !== observedPendingCount || readyIndex(pending, Date.now()) >= 0,
        waitMs,
      );
      continue;
    }

    const [envelope] = pending.splice(index, 1);
    try {
      // Do not start the next message until this complete retry chain settles.
      await processFedifyMessage(envelope);
      processedCount += 1;
    } catch (error) {
      // Activity failure events remain in Temporal history; this durable
      // summary makes the exhausted item observable in the eventual result
      // while allowing later messages for the same key to continue.
      failedCount += 1;
      failures.push({
        id: envelope.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    messagesSinceContinueAsNew += 1;

    if (
      pending.length > 0 &&
      (messagesSinceContinueAsNew >= FEDIFY_KEYED_CONTINUE_AS_NEW_AFTER ||
        workflowInfo().continueAsNewSuggested)
    ) {
      // Continue-As-New is issued only by the main Workflow, after the
      // synchronous handler boundary above. All pending state accepted before
      // this command is explicitly carried in the new input; signal races at
      // this boundary are covered by integration tests.
      await continueAsNew<typeof fedifyKeyedMessageWorkflow>({
        orderingKey: input.orderingKey,
        pending,
        processedCount,
        failedCount,
      });
    }
  }
}
