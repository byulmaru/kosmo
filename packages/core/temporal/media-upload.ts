import type { WorkflowDefinition } from './client';

export const MEDIA_UPLOAD_WORKFLOW_TYPE = 'mediaUploadWorkflow';
export const MEDIA_UPLOAD_MAX_BYTES = 16_777_216;
export const MEDIA_UPLOAD_MAX_DIMENSION = 8192;

export type MediaUploadWorkflowInput = {
  readonly mediaId: string;
  readonly accountId: string;
};

export type MediaUploadWorkflowResult = {
  readonly id: string;
  readonly url: string;
  readonly mediaType: string;
};

export const mediaUploadWorkflow: WorkflowDefinition<
  (input: MediaUploadWorkflowInput) => Promise<MediaUploadWorkflowResult>
> = {
  workflow: MEDIA_UPLOAD_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) => `media-upload:${input.mediaId}`,
};
