import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { TemporalOperationHandler } from '@temporalio/nexus';
import { HandlerError, serviceHandler } from 'nexus-rpc';
import { mediaUploadService } from './media-upload-service';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

export const mediaUploadServiceHandler = serviceHandler(mediaUploadService, {
  processUpload: new TemporalOperationHandler<MediaUploadWorkflowInput, MediaUploadWorkflowResult>({
    start: async (_context, client, input) => {
      try {
        return await client.startWorkflow(mediaUploadWorkflow.workflow, {
          args: [input],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: mediaUploadWorkflow.workflowIdFromArgs(input),
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        });
      } catch (error) {
        if (error instanceof WorkflowExecutionAlreadyStartedError) {
          throw new HandlerError('CONFLICT', 'upload ID has already been used', {
            cause: error,
            retryableOverride: false,
          });
        }
        throw error;
      }
    },
    cancelWorkflowRun: async () => {
      // A post request does not own the shared media upload.
    },
  }),
});
