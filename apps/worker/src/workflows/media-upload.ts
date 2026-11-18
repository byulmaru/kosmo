import { runLegacyMediaUploadWorkflow } from './media-upload-body';
import type { MediaUploadWorkflowInput } from '@kosmo/core/temporal/media-upload';

export async function mediaUploadWorkflow(input: MediaUploadWorkflowInput) {
  return runLegacyMediaUploadWorkflow(input);
}
