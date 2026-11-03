import type { WorkflowUpdateDefinition } from './client';

export const MEDIA_UPLOAD_WORKFLOW_TYPE = 'mediaUploadWorkflow';
export const MEDIA_UPLOAD_PUBLISH_UPDATE_NAME = 'mediaUploadPublish';
export const MEDIA_UPLOAD_MAX_BYTES = 16_777_216;
export const MEDIA_UPLOAD_MAX_DIMENSION = 8192;

export type MediaUploadWorkflowInput = {
  readonly mediaId: string;
  readonly accountId: string;
  readonly applyAiProhibitFilter?: boolean;
  readonly applyNightshade?: boolean;
};

export type MediaUploadResult = {
  readonly id: string;
  readonly url: string;
  readonly mediaType: string;
};

export type MediaUploadWorkflowResult = MediaUploadResult & {
  readonly applyAiProhibitFilter?: boolean;
};

export type MediaUploadPublishInput = {
  readonly applyAiProhibitFilter: boolean;
};

export type MediaUploadPublishResult =
  | ({ readonly status: 'completed' } & MediaUploadResult)
  | { readonly status: 'processing'; readonly id: string };

export const mediaUploadWorkflow: WorkflowUpdateDefinition<
  (input: MediaUploadWorkflowInput) => Promise<MediaUploadWorkflowResult>,
  MediaUploadPublishResult,
  [MediaUploadPublishInput]
> = {
  workflow: MEDIA_UPLOAD_WORKFLOW_TYPE,
  update: MEDIA_UPLOAD_PUBLISH_UPDATE_NAME,
  workflowIdFromArgs: (input) => `media-upload:${input.mediaId}`,
  timeoutMs: 60_000,
};
