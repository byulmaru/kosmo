import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { TemporalOperationHandler } from '@temporalio/nexus';
import { serviceHandler } from 'nexus-rpc';
import { mediaUploadService } from './media-upload-service';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

export const mediaUploadServiceHandler = serviceHandler(mediaUploadService, {
  processUpload: new TemporalOperationHandler<MediaUploadWorkflowInput, MediaUploadWorkflowResult>({
    start: (_context, client, input) =>
      client.startWorkflow(mediaUploadWorkflow.workflow, {
        args: [input],
        taskQueue: KOSMO_TASK_QUEUE,
        workflowId: mediaUploadWorkflow.workflowIdFromArgs(input),
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      }),
    cancelWorkflowRun: async () => {
      // A post request does not own the shared media upload.
    },
  }),
});
