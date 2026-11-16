import { withPrimaryDatabase } from '@kosmo/core/db';
import {
  fanoutHomeTimelinePost,
  insertHomeTimelinePost,
  listHomeTimelineRecipientPage,
  reconcileHomeTimelineFollow,
  removeHomeTimelinePost,
} from '@kosmo/core/home-timeline/cache';
import { runWorkflow } from '@kosmo/core/temporal/client';
import {
  PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX,
  PROFILE_FOLLOW_PAIR_WORKFLOW_TYPE,
  PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX,
  PROFILE_FOLLOW_REMOVAL_WORKFLOW_TYPE,
} from '@kosmo/core/temporal/follow-command';
import { homeTimelineFollowReconciliationWorkflow } from '@kosmo/core/temporal/workflows';
import { activityInfo, ApplicationFailure } from '@temporalio/activity';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { z } from 'zod';
import type {
  HomeTimelineFollowReconciliationInput,
  HomeTimelineFollowReconciliationRequest,
} from '@kosmo/core/temporal/workflows';

const reconciliationRequestSchema = z.object({
  profileId: z.string().min(1),
  followeeProfileId: z.string().min(1),
});

const legacyReconciliationInputSchema = z.object({
  profileId: z.string().min(1),
});

type ProfileFollowExecution = {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

const invalidLegacyContext = (reason: string): never => {
  throw ApplicationFailure.nonRetryable(
    `Could not determine the Home timeline follow reconciliation target: ${reason}`,
    'HomeTimelineFollowReconciliationContextError',
  );
};

const parseProfileFollowExecution = (
  workflowType: string | undefined,
  workflowId: string | undefined,
): ProfileFollowExecution | undefined => {
  if (workflowType === PROFILE_FOLLOW_PAIR_WORKFLOW_TYPE) {
    if (!workflowId?.startsWith(PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX)) {
      return undefined;
    }
    const parts = workflowId.slice(PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX.length).split(':');
    if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
      return undefined;
    }
    const [followerProfileId, followeeProfileId] = parts;
    return followerProfileId && followeeProfileId
      ? { followerProfileId, followeeProfileId }
      : undefined;
  }

  if (workflowType === PROFILE_FOLLOW_REMOVAL_WORKFLOW_TYPE) {
    if (!workflowId?.startsWith(PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX)) {
      return undefined;
    }
    const parts = workflowId.slice(PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX.length).split(':');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
      return undefined;
    }
    const [followerProfileId, followeeProfileId] = parts;
    return followerProfileId && followeeProfileId
      ? { followerProfileId, followeeProfileId }
      : undefined;
  }

  return undefined;
};

export const admitHomeTimelineFollowReconciliationActivity = async (
  input: HomeTimelineFollowReconciliationInput & HomeTimelineFollowReconciliationRequest,
): Promise<void> => {
  const { profileId, followeeProfileId } = reconciliationRequestSchema.parse(input);

  await runWorkflow(homeTimelineFollowReconciliationWorkflow, {
    mode: 'update-with-start',
    args: [{ profileId }],
    updateArgs: [{ followeeProfileId }],
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });
};

/**
 * Legacy Follow histories stored only the follower ID in this Activity input.
 * Their exact target remains available in the owning Workflow ID.
 */
export const reconcileHomeTimelineFollowActivity = async (input: {
  readonly profileId: string;
}): Promise<void> => {
  const parsedInput = legacyReconciliationInputSchema.parse(input);
  const activity = activityInfo();
  const execution = parseProfileFollowExecution(
    activity.workflowType,
    activity.workflowExecution?.workflowId,
  );
  if (execution === undefined) {
    throw ApplicationFailure.nonRetryable(
      'Could not determine the Home timeline follow reconciliation target: missing or unrecognized Workflow type and ID',
      'HomeTimelineFollowReconciliationContextError',
    );
  }
  if (execution.followerProfileId !== parsedInput.profileId) {
    invalidLegacyContext('the Workflow follower does not match the Activity input');
  }

  await admitHomeTimelineFollowReconciliationActivity({
    profileId: parsedInput.profileId,
    followeeProfileId: execution.followeeProfileId,
  });
};

export const fanoutHomeTimelinePostActivity = (
  ...args: Parameters<typeof fanoutHomeTimelinePost>
): ReturnType<typeof fanoutHomeTimelinePost> =>
  withPrimaryDatabase(() => fanoutHomeTimelinePost(...args));

export const insertHomeTimelinePostActivity = (
  ...args: Parameters<typeof insertHomeTimelinePost>
): ReturnType<typeof insertHomeTimelinePost> =>
  withPrimaryDatabase(() => insertHomeTimelinePost(...args));

export const loadHomeTimelineRecipientPageActivity = (
  ...args: Parameters<typeof listHomeTimelineRecipientPage>
): ReturnType<typeof listHomeTimelineRecipientPage> =>
  withPrimaryDatabase(() => listHomeTimelineRecipientPage(...args));

export const removeHomeTimelinePostActivity = (
  ...args: Parameters<typeof removeHomeTimelinePost>
): ReturnType<typeof removeHomeTimelinePost> =>
  withPrimaryDatabase(() => removeHomeTimelinePost(...args));

export const reconcileHomeTimelineFollowChangesActivity = (
  ...args: Parameters<typeof reconcileHomeTimelineFollow>
): ReturnType<typeof reconcileHomeTimelineFollow> =>
  withPrimaryDatabase(() => reconcileHomeTimelineFollow(...args));
