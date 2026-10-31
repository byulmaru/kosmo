import {
  ApplicationFailure,
  CancellationScope,
  condition,
  createNexusServiceClient,
  defineSignal,
  isCancellation,
  NexusOperationCancellationType,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { mediaUploadService } from '../nexus/media-upload-service';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

export const MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL = 'mediaUploadTestPublished';
export const MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL = 'mediaUploadTestComplete';
export const MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_CANCEL_SIGNAL = 'mediaUploadNexusCancelProbeCancel';
export const MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_FINISH_SIGNAL = 'mediaUploadNexusCancelProbeFinish';

const publishedSignal = defineSignal(MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL);
const completeSignal = defineSignal(MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL);
const cancelProbeSignal = defineSignal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_CANCEL_SIGNAL);
const finishProbeSignal = defineSignal(MEDIA_UPLOAD_NEXUS_CANCEL_PROBE_FINISH_SIGNAL);

export type MockMediaUploadOperationInput = {
  readonly result: MediaUploadWorkflowResult;
  readonly shouldFail: boolean;
};

export async function mockMediaUploadNexusOperationWorkflow({
  result,
  shouldFail,
}: MockMediaUploadOperationInput) {
  let published = false;
  let completed = false;

  setHandler(publishedSignal, () => {
    published = true;
  });
  setHandler(completeSignal, () => {
    completed = true;
  });

  await condition(() => published && completed);

  if (shouldFail) {
    throw ApplicationFailure.nonRetryable(
      'Mock Media Upload processing failed',
      'MockMediaUploadFailed',
    );
  }

  return result;
}

export async function mediaUploadNexusCancelProbeWorkflow(input: MediaUploadWorkflowInput) {
  const client = createNexusServiceClient({
    endpoint: `${workflowInfo().namespace}-media-upload`,
    service: mediaUploadService,
  });
  const cancellationScope = new CancellationScope();
  let finished = false;

  setHandler(cancelProbeSignal, () => cancellationScope.cancel());
  setHandler(finishProbeSignal, () => {
    finished = true;
  });

  try {
    await cancellationScope.run(() =>
      client.executeOperation('processUpload', input, {
        cancellationType: NexusOperationCancellationType.TRY_CANCEL,
        scheduleToCloseTimeout: '76 hours',
      }),
    );
  } catch (error) {
    if (!isCancellation(error)) {
      throw error;
    }
  }

  await condition(() => finished);
  return { cancelled: cancellationScope.consideredCancelled };
}
