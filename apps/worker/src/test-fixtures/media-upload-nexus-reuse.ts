import {
  createNexusServiceClient,
  NexusOperationCancellationType,
  workflowInfo,
} from '@temporalio/workflow';
import { mediaUploadService } from '../nexus/media-upload-service';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

export async function mediaUploadWorkflow({
  mediaId,
  applyAiProhibitFilter,
}: MediaUploadWorkflowInput): Promise<MediaUploadWorkflowResult> {
  return {
    id: `u_${mediaId}`,
    url: `https://media.example/${mediaId}.jpg`,
    mediaType: 'image/jpeg',
    ...(applyAiProhibitFilter === undefined ? {} : { applyAiProhibitFilter }),
  };
}

export async function mediaUploadNexusReuseCallerWorkflow(
  input: MediaUploadWorkflowInput,
): Promise<MediaUploadWorkflowResult> {
  const client = createNexusServiceClient({
    endpoint: `${workflowInfo().namespace}-media-upload`,
    service: mediaUploadService,
  });
  return client.executeOperation('processUpload', input, {
    cancellationType: NexusOperationCancellationType.ABANDON,
    scheduleToCloseTimeout: '5 seconds',
  });
}
