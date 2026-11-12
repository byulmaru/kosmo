import type { WorkflowUpdateDefinition } from './client';

export const HOME_TIMELINE_FOLLOW_RECONCILIATION_WORKFLOW_TYPE =
  'homeTimelineFollowReconciliationWorkflow';
export const HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME =
  'homeTimelineFollowReconciliationUpdate';

export type HomeTimelineFollowReconciliationInput = {
  readonly profileId: string;
};

export type HomeTimelineFollowReconciliationRequest = {
  readonly followeeProfileId: string;
};

export const homeTimelineFollowReconciliationWorkflow: WorkflowUpdateDefinition<
  (input: HomeTimelineFollowReconciliationInput) => Promise<void>,
  void,
  [HomeTimelineFollowReconciliationRequest]
> = {
  workflow: HOME_TIMELINE_FOLLOW_RECONCILIATION_WORKFLOW_TYPE,
  update: HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME,
  workflowIdFromArgs: ({ profileId }) => `home-timeline-follow-reconciliation:${profileId}`,
};
