import type { MediaProviderPublicationMetadata, MediaPublicationMetadata } from '../media-metadata';
import type { WorkflowUpdateDefinition } from './client';

export const MEDIA_UPLOAD_WORKFLOW_TYPE = 'mediaUploadWorkflow';
export const MEDIA_UPLOAD_WITH_METADATA_WORKFLOW_TYPE = 'mediaUploadWithMetadataWorkflow';
export const MEDIA_UPLOAD_PUBLISH_UPDATE_NAME = 'mediaUploadPublish';
export const MEDIA_UPLOAD_METADATA_PUBLISH_UPDATE_NAME = 'mediaUploadMetadataPublish';
export const MEDIA_UPLOAD_MAX_BYTES = 16_777_216;
export const MEDIA_UPLOAD_MAX_DIMENSION = 8192;

export type MediaUploadWorkflowInput = {
  readonly mediaId: string;
  readonly accountId: string;
  readonly applyAiProhibitFilter?: boolean;
  readonly applyNightshade?: boolean;
};

export type MediaUploadWithMetadataWorkflowInput = {
  readonly mediaId: string;
  readonly accountId: string;
  readonly applyAiProhibitFilter: boolean;
  readonly publicationMetadata: MediaPublicationMetadata;
};

export type MediaUploadPreparationInput =
  | MediaUploadWorkflowInput
  | MediaUploadWithMetadataWorkflowInput;

export type MediaUploadResult = {
  readonly id: string;
  readonly metadata?: MediaProviderPublicationMetadata;
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

export const mediaUploadWithMetadataWorkflow: WorkflowUpdateDefinition<
  (input: MediaUploadWithMetadataWorkflowInput) => Promise<MediaUploadWorkflowResult>,
  MediaUploadPublishResult,
  [MediaUploadPublishInput]
> = {
  workflow: MEDIA_UPLOAD_WITH_METADATA_WORKFLOW_TYPE,
  update: MEDIA_UPLOAD_METADATA_PUBLISH_UPDATE_NAME,
  workflowIdFromArgs: (input) => `media-upload:${input.mediaId}`,
  timeoutMs: 60_000,
};
