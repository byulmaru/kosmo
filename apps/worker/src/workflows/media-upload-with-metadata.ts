import { runMediaUploadWithMetadataWorkflow } from './media-upload-body';
import type { MediaUploadWithMetadataWorkflowInput } from '@kosmo/core/temporal/media-upload';

export async function mediaUploadWithMetadataWorkflow(input: MediaUploadWithMetadataWorkflowInput) {
  return runMediaUploadWithMetadataWorkflow(input);
}
