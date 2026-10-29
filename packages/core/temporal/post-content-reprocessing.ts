import { createHash } from 'node:crypto';
import type { WorkflowDefinition } from './client';

export const REPROCESS_LOCAL_POST_CONTENTS_WORKFLOW_TYPE = 'reprocessLocalPostContentsWorkflow';

export type PostContentReprocessingStatus = 'updated' | 'wouldUpdate' | 'unchanged' | 'skipped';

export type ReprocessLocalPostContentTarget = {
  readonly postId: string;
  readonly postContentId: string;
};

export type ReprocessLocalPostContentInput = ReprocessLocalPostContentTarget & {
  readonly dryRun?: boolean;
};

export type ReprocessLocalPostContentResult = {
  readonly status: PostContentReprocessingStatus;
};

export type PostContentReprocessingCounts = Readonly<Record<PostContentReprocessingStatus, number>>;

export type ReprocessLocalPostContentsContinuation = {
  readonly counts: PostContentReprocessingCounts;
};

export type ReprocessLocalPostContentsInput = {
  readonly targets: readonly ReprocessLocalPostContentTarget[];
  readonly dryRun?: boolean;
  readonly continuation?: ReprocessLocalPostContentsContinuation;
};

export type ReprocessLocalPostContentsResult = {
  readonly counts: PostContentReprocessingCounts;
};

export const reprocessLocalPostContentsWorkflow: WorkflowDefinition<
  (input: ReprocessLocalPostContentsInput) => Promise<ReprocessLocalPostContentsResult>
> = {
  workflow: REPROCESS_LOCAL_POST_CONTENTS_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ targets, dryRun }) => {
    const targetScope = createHash('sha256')
      .update(JSON.stringify(targets.map(({ postId, postContentId }) => [postId, postContentId])))
      .digest('hex');
    return (
      REPROCESS_LOCAL_POST_CONTENTS_WORKFLOW_TYPE +
      ':' +
      targetScope +
      ':' +
      (dryRun === false ? 'apply' : 'dry-run')
    );
  },
};
