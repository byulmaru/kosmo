import { HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME } from '@kosmo/core/temporal/workflows';
import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type {
  HomeTimelineFollowReconciliationInput,
  HomeTimelineFollowReconciliationRequest,
} from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const inputSchema = z.object({
  profileId: z.string().min(1, 'Home timeline reconciliation requires a profile ID'),
});

const updateInputSchema = z.object({
  followeeProfileId: z
    .string()
    .min(1, 'Home timeline reconciliation requires a followee profile ID'),
});

const { reconcileHomeTimelineFollowChangesActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);
const reconciliationUpdate = defineUpdate<void, [HomeTimelineFollowReconciliationRequest]>(
  HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME,
);

export async function homeTimelineFollowReconciliationWorkflow(
  value: HomeTimelineFollowReconciliationInput,
): Promise<void> {
  const parsedInput = inputSchema.safeParse(value);
  if (!parsedInput.success) {
    throw ApplicationFailure.nonRetryable(
      parsedInput.error.issues[0]?.message ?? 'Home timeline reconciliation input is invalid',
    );
  }

  const pendingFolloweeProfileIds = new Set<string>();
  setHandler(
    reconciliationUpdate,
    ({ followeeProfileId }) => {
      pendingFolloweeProfileIds.add(followeeProfileId);
    },
    {
      validator: (request) => {
        const parsedRequest = updateInputSchema.safeParse(request);
        if (!parsedRequest.success) {
          throw ApplicationFailure.nonRetryable(
            parsedRequest.error.issues[0]?.message ??
              'Home timeline reconciliation request is invalid',
          );
        }
      },
    },
  );

  while (true) {
    await condition(() => pendingFolloweeProfileIds.size > 0);
    const followeeProfileIds = [...pendingFolloweeProfileIds];
    pendingFolloweeProfileIds.clear();
    await reconcileHomeTimelineFollowChangesActivity({
      profileId: parsedInput.data.profileId,
      followeeProfileIds,
    });
    await condition(allHandlersFinished);
    if (pendingFolloweeProfileIds.size === 0) {
      return;
    }
  }
}
