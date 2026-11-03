import { createHash } from 'node:crypto';
import type { WorkflowDefinition } from './client';

export const REPROCESS_LOCAL_POST_CONTENTS_WORKFLOW_TYPE = 'reprocessLocalPostContentsWorkflow';

export type PostContentReprocessingStatus = 'updated' | 'wouldUpdate' | 'unchanged' | 'skipped';

export type ReprocessLocalPostContentInput = {
  readonly postId: string;
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
  readonly postIds: readonly string[];
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
  workflowIdFromArgs: ({ postIds, dryRun }) => {
    const postIdsHash = createHash('sha256').update(JSON.stringify(postIds)).digest('hex');
    return (
      REPROCESS_LOCAL_POST_CONTENTS_WORKFLOW_TYPE +
      ':' +
      postIdsHash +
      ':' +
      (dryRun === false ? 'apply' : 'dry-run')
    );
  },
};
