import {
  CancellationScope,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';

// Experimental fixture only: executes real Activities against real PostgreSQL.
export type Command = {
  id: string;
  expected: 'APPROVED' | 'REVOKED' | 'PENDING';
  next: 'APPROVED' | 'REVOKED';
};
export type Input = {
  fixtureId: string;
  fenced: boolean;
  attempts: number;
  drain?: boolean;
  sourceLock?: boolean;
  link?: boolean;
};
export type WriteInput = Input & Command & { runId: string };

export async function quoteCasExperiment(input: Input): Promise<void> {
  const { writeConsent } = proxyActivities<{
    writeConsent(input: WriteInput): Promise<string>;
  }>({
    startToCloseTimeout: '2 seconds',
    retry: { maximumAttempts: input.attempts, initialInterval: '100 milliseconds' },
  });
  const queue: Command[] = [];
  const { drainWrites } = proxyActivities<{ drainWrites(fixtureId: string): Promise<void> }>({
    startToCloseTimeout: '5 seconds',
  });
  let active: string | null = null;
  let finish = false;
  let renew = false;
  let completed = 0;
  let activeScope: CancellationScope | undefined;
  const completedIds = new Set<string>();
  setHandler(defineQuery('active'), () => ({ runId: workflowInfo().runId, active, completed }));
  setHandler(defineSignal<[Command]>('command'), (command) => {
    queue.push(command);
  });
  setHandler(defineUpdate<void, [Command]>('commandUpdate'), async (command) => {
    queue.push(command);
    await condition(() => completedIds.has(command.id));
  });
  setHandler(defineSignal('cancel-active'), () => activeScope?.cancel());
  setHandler(defineSignal('finish'), () => {
    finish = true;
  });
  setHandler(defineSignal('renew'), () => {
    renew = true;
  });
  while (true) {
    await condition(() => queue.length > 0 || finish || renew);
    if (queue.length > 0) {
      const command = queue.shift()!;
      active = command.id;
      try {
        activeScope = new CancellationScope();
        await activeScope.run(() =>
          writeConsent({ ...input, ...command, runId: workflowInfo().runId }),
        );
      } catch {
        // Deliberately advance after timeout to exercise the proposed fence.
      }
      active = null;
      if (input.drain) {
        await drainWrites(input.fixtureId);
      }
      completed++;
      completedIds.add(command.id);
    } else if (renew) {
      await continueAsNew<typeof quoteCasExperiment>(input);
    } else if (finish) {
      return;
    }
  }
}

export async function sourceDeletionExperiment(input: {
  sourcePostId: string;
  gateId: string;
}): Promise<void> {
  const { deleteSource } = proxyActivities<{
    deleteSource(input: { sourcePostId: string; gateId: string }): Promise<void>;
  }>({ startToCloseTimeout: '10 seconds', retry: { maximumAttempts: 3 } });
  await deleteSource(input);
}
