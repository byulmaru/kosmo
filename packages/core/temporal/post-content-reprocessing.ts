import type { WorkflowDefinition } from './client';

export const REPROCESS_LOCAL_POST_CONTENT_WORKFLOW_TYPE = 'reprocessLocalPostContentWorkflow';
export const BACKFILL_LOCAL_POST_CONTENT_HASHTAGS_WORKFLOW_TYPE =
  'backfillLocalPostContentHashtagsWorkflow';

export type PostContentReprocessingStatus = 'updated' | 'wouldUpdate' | 'unchanged' | 'skipped';

export type ReprocessLocalPostContentInput = {
  readonly postId: string;
  readonly postContentId: string;
  readonly dryRun?: boolean;
};

export type ReprocessLocalPostContentResult = {
  readonly status: PostContentReprocessingStatus;
};

export type PostContentReprocessingCounts = Readonly<Record<PostContentReprocessingStatus, number>>;

export type BackfillLocalPostContentHashtagsContinuation = {
  readonly maxPostId: string;
  readonly afterPostId?: string;
  readonly counts: PostContentReprocessingCounts;
};

export type BackfillLocalPostContentHashtagsInput = {
  readonly dryRun?: boolean;
  readonly continuation?: BackfillLocalPostContentHashtagsContinuation;
};

export type BackfillLocalPostContentHashtagsResult = {
  readonly maxPostId: string | null;
  readonly counts: PostContentReprocessingCounts;
};

export const reprocessLocalPostContentWorkflow: WorkflowDefinition<
  (input: ReprocessLocalPostContentInput) => Promise<ReprocessLocalPostContentResult>
> = {
  workflow: REPROCESS_LOCAL_POST_CONTENT_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ postId, postContentId, dryRun }) =>
    REPROCESS_LOCAL_POST_CONTENT_WORKFLOW_TYPE +
    ':' +
    JSON.stringify([postId, postContentId, dryRun ?? true]),
};

export const backfillLocalPostContentHashtagsWorkflow: WorkflowDefinition<
  (input: BackfillLocalPostContentHashtagsInput) => Promise<BackfillLocalPostContentHashtagsResult>
> = {
  workflow: BACKFILL_LOCAL_POST_CONTENT_HASHTAGS_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ dryRun }) =>
    BACKFILL_LOCAL_POST_CONTENT_HASHTAGS_WORKFLOW_TYPE +
    ':' +
    (dryRun === false ? 'apply' : 'dry-run'),
};
