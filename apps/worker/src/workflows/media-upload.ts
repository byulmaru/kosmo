import {
  MEDIA_UPLOAD_MAX_BYTES,
  MEDIA_UPLOAD_MAX_DIMENSION,
} from '@kosmo/core/temporal/media-upload';
import {
  ApplicationFailure,
  createNexusServiceClient,
  proxyActivities,
} from '@temporalio/workflow';
import { operation, service } from 'nexus-rpc';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { NexusMediaUploadContentType } from '@kosmo/core/media-upload';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type * as activities from '../activities';

type ProcessUploadInput = {
  readonly id: string;
  readonly sourceKey: string;
  readonly contentType: NexusMediaUploadContentType;
  readonly maxBytes: number;
  readonly maxDimension: number;
};

const mediaService = service('media', {
  startUpload: operation<ProcessUploadInput, MediaUploadWorkflowResult>(),
  applyHope: operation<
    {
      readonly id: string;
      readonly hope: {
        readonly algorithm: 'nightshade';
        readonly iterations: number;
        readonly intensity: number;
      };
    },
    { readonly id: string }
  >(),
  publishUpload: operation<{ readonly id: string }, { readonly id: string }>(),
});

const { prepareMediaUploadActivity, finalizeMediaUploadActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const inputSchema = z.strictObject({
  mediaId: z.uuid(),
  accountId: z.uuid(),
  applyNightshade: z.boolean().default(false),
});

export async function mediaUploadWorkflow(input: MediaUploadWorkflowInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Media Upload workflow input is invalid',
      'MediaUploadWorkflowInputInvalid',
    );
  }

  const prepared = await prepareMediaUploadActivity(parsed.data);
  const client = createNexusServiceClient({ service: mediaService, endpoint: 'media-upload' });
  const upload = await client.startOperation(
    'startUpload',
    {
      ...prepared,
      maxBytes: MEDIA_UPLOAD_MAX_BYTES,
      maxDimension: MEDIA_UPLOAD_MAX_DIMENSION,
    },
    { scheduleToCloseTimeout: '25 hours' },
  );

  if (parsed.data.applyNightshade) {
    await client.executeOperation(
      'applyHope',
      {
        id: prepared.id,
        hope: { algorithm: 'nightshade', iterations: 562, intensity: 0.3 },
      },
      { scheduleToCloseTimeout: '25 hours' },
    );
  }

  await client.executeOperation(
    'publishUpload',
    { id: prepared.id },
    { scheduleToCloseTimeout: '25 hours' },
  );

  const result = await upload.result();
  return finalizeMediaUploadActivity({
    ...parsed.data,
    remoteUploadId: prepared.id,
    result,
  });
}
