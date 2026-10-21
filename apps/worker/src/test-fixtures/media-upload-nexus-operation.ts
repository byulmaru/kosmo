import { ApplicationFailure, condition, defineSignal, setHandler } from '@temporalio/workflow';
import type { MediaUploadWorkflowResult } from '@kosmo/core/temporal/media-upload';

export const MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL = 'mediaUploadTestPublished';
export const MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL = 'mediaUploadTestComplete';

const publishedSignal = defineSignal(MEDIA_UPLOAD_TEST_PUBLISHED_SIGNAL);
const completeSignal = defineSignal(MEDIA_UPLOAD_TEST_COMPLETE_SIGNAL);

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
