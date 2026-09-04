import {
  allHandlersFinished,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
} from '@temporalio/workflow';
import { workflowActivityOptions } from '../workflows/activity-options';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairTransitionExecution,
  ProfileFollowPairTransitionOutcome,
} from '@kosmo/core/services';

const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';

type LegacyProfileFollowPairTransitionInput = {
  readonly pair: ProfileFollowPair;
  readonly command: ProfileFollowPairCommand;
  readonly candidateRowId?: string;
  readonly followCandidateId?: string;
  readonly pendingRequestId?: string;
};

type LegacyActivities = {
  readonly executeProfileFollowPairTransitionActivity: (
    input: LegacyProfileFollowPairTransitionInput,
  ) => Promise<ProfileFollowPairTransitionExecution>;
  readonly loadPendingFollowRequestIdActivity: (input: {
    readonly pair: ProfileFollowPair;
    readonly expectedRowId?: string;
  }) => Promise<string | undefined>;
};

const { executeProfileFollowPairTransitionActivity, loadPendingFollowRequestIdActivity } =
  proxyActivities<LegacyActivities>(workflowActivityOptions);

/**
 * Minimal pre-PROD-892 bundle used only to produce a genuine old history.
 * Its Activity command order matches the current pair Workflow, while its
 * transition input still includes the UUID candidate fields removed by PROD-892.
 */
export async function profileFollowPairWorkflow(input: ProfileFollowPair): Promise<void> {
  let updateReceived = false;
  let lifecycleState: 'INITIAL' | 'PENDING' | 'ESTABLISHED' | 'REJECTED' | 'CANCELLED' = 'INITIAL';
  let pendingRequestId: string | undefined;

  setHandler(
    defineUpdate<ProfileFollowPairTransitionOutcome, [ProfileFollowPairCommand]>(
      PROFILE_FOLLOW_PAIR_UPDATE_NAME,
    ),
    async (command) => {
      updateReceived = true;
      if (lifecycleState === 'INITIAL' && command.kind === 'FOLLOW') {
        pendingRequestId = await loadPendingFollowRequestIdActivity({ pair: input });
      }
      if (lifecycleState === 'INITIAL' && command.kind !== 'FOLLOW') {
        pendingRequestId = await loadPendingFollowRequestIdActivity({
          pair: input,
          expectedRowId: command.expectedRowId,
        });
      }
      const execution = await executeProfileFollowPairTransitionActivity({
        pair: input,
        command,
        candidateRowId: command.kind === 'FOLLOW' ? uuid4() : undefined,
        followCandidateId:
          command.kind === 'APPROVE' || command.kind === 'ACCEPT' ? uuid4() : undefined,
        pendingRequestId,
      });
      if (execution.ok) {
        lifecycleState = execution.nextState;
        if (execution.nextState === 'PENDING') {
          pendingRequestId = execution.pendingRequestId;
        }
      }
      return execution.ok ? { ok: true as const, result: execution.result } : execution;
    },
  );

  await condition(() => updateReceived);
  await condition(allHandlersFinished);
  const isPending = () => lifecycleState === 'PENDING';
  while (isPending()) {
    await condition(() => !isPending());
    await condition(allHandlersFinished);
  }
}
