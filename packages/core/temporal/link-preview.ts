import type { WorkflowDefinition } from './client';

export const LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE = 'linkPreviewCollectionWorkflow';

export type LinkPreviewCollectionInput = {
  readonly postId: string;
};

export const linkPreviewCollectionWorkflow: WorkflowDefinition<
  (input: LinkPreviewCollectionInput) => Promise<void>
> = {
  workflow: LINK_PREVIEW_COLLECTION_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ postId }) => `post-link-preview:${postId}`,
};
