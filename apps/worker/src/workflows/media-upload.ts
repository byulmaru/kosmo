import {
  MEDIA_UPLOAD_MAX_BYTES,
  MEDIA_UPLOAD_MAX_DIMENSION,
  MEDIA_UPLOAD_PUBLISH_UPDATE_NAME,
} from '@kosmo/core/temporal/media-upload';
import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  createNexusServiceClient,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { operation, service } from 'nexus-rpc';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type {
  MediaUploadPublishInput,
  MediaUploadPublishResult,
  MediaUploadResult,
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';
import type { NexusMediaUploadContentType } from '@kosmo/core/media-upload';
import type * as activities from '../activities';

type ProcessUploadInput = {
  readonly id: string;
  readonly sourceKey: string;
  readonly contentType: NexusMediaUploadContentType;
  readonly maxBytes: number;
  readonly maxDimension: number;
};

const mediaService = service('media', {
  startUpload: operation<ProcessUploadInput, MediaUploadResult>(),
  applyHope: operation<
    {
      readonly id: string;
      readonly hope: {
        readonly algorithm: 'glaze';
        readonly iterations: number;
        readonly intensity: number;
      };
    },
    { readonly id: string }
  >(),
  publishUpload: operation<{ readonly id: string }, { readonly id: string }>(),
  publishUploadV2: operation<
    { readonly id: string; readonly applyAiProhibitFilter: boolean },
    MediaUploadPublishResult
  >(),
});

const { prepareMediaUploadActivity, finalizeMediaUploadActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const inputSchema = z.object({
  mediaId: z.uuid(),
  accountId: z.uuid(),
  applyAiProhibitFilter: z.boolean().optional(),
  applyNightshade: z.boolean().default(false),
});

const publishInputSchema = z.object({ applyAiProhibitFilter: z.boolean() });

const completedPublication = (
  { id, mediaType, url }: MediaUploadResult,
): MediaUploadPublishResult => ({
  id,
  mediaType,
  status: 'completed',
  url,
});

export async function mediaUploadWorkflow(input: MediaUploadWorkflowInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Media Upload workflow input is invalid',
      'MediaUploadWorkflowInputInvalid',
    );
  }

  const client = createNexusServiceClient({ service: mediaService, endpoint: 'media-upload' });
  const applyAiProhibitFilter = parsed.data.applyAiProhibitFilter;
  const isNewInput = applyAiProhibitFilter !== undefined;
  const selectedFilter = applyAiProhibitFilter ?? parsed.data.applyNightshade;
  let publicationResult: MediaUploadPublishResult | undefined;
  let finalizedResult: MediaUploadWorkflowResult | undefined;
  let failure: { readonly error: unknown } | undefined;

  setHandler(
    defineUpdate<MediaUploadPublishResult, [MediaUploadPublishInput]>(
      MEDIA_UPLOAD_PUBLISH_UPDATE_NAME,
    ),
    async (value) => {
      const update = publishInputSchema.safeParse(value);
      if (!update.success) {
        throw ApplicationFailure.nonRetryable(
          update.error.issues[0]?.message ?? 'Media Upload publication input is invalid',
          'MediaUploadPublishInputInvalid',
        );
      }
      if (update.data.applyAiProhibitFilter !== selectedFilter) {
        throw ApplicationFailure.nonRetryable(
          'Media filter selection changed; attach the Media again',
          'MediaUploadSelectionConflict',
        );
      }

      if (failure) {
        throw failure.error;
      }
      await condition(() => failure !== undefined || publicationResult !== undefined);
      if (failure) {
        throw failure.error;
      }
      return publicationResult!;
    },
  );

  try {
    const prepared = await prepareMediaUploadActivity(parsed.data);
    const upload = await client.startOperation(
      'startUpload',
      {
        ...prepared,
        maxBytes: MEDIA_UPLOAD_MAX_BYTES,
        maxDimension: MEDIA_UPLOAD_MAX_DIMENSION,
      },
      { scheduleToCloseTimeout: '25 hours' },
    );

    if (isNewInput) {
      const publication = await client.executeOperation(
        'publishUploadV2',
        { id: prepared.id, applyAiProhibitFilter: selectedFilter },
        { scheduleToCloseTimeout: '25 hours' },
      );

      if (publication.status === 'processing') {
        publicationResult = publication;
      } else {
        const finalized = await finalizeMediaUploadActivity({
          ...parsed.data,
          remoteUploadId: prepared.id,
          result: {
            id: publication.id,
            mediaType: publication.mediaType,
            url: publication.url,
          },
        });
        finalizedResult = { ...finalized, applyAiProhibitFilter: selectedFilter };
        publicationResult = completedPublication(publication);
      }
    } else {
      if (selectedFilter) {
        publicationResult = { id: prepared.id, status: 'processing' };
        await client.executeOperation(
          'applyHope',
          {
            id: prepared.id,
            hope: { algorithm: 'glaze', iterations: 450, intensity: 0.3 },
          },
          { scheduleToCloseTimeout: '25 hours' },
        );
      }

      await client.executeOperation(
        'publishUpload',
        { id: prepared.id },
        { scheduleToCloseTimeout: '25 hours' },
      );
    }

    const uploadResult = await upload.result();
    if (!finalizedResult) {
      const finalized = await finalizeMediaUploadActivity({
        ...parsed.data,
        remoteUploadId: prepared.id,
        result: uploadResult,
      });
      finalizedResult = {
        ...finalized,
        ...(isNewInput ? { applyAiProhibitFilter: selectedFilter } : {}),
      };
    }
    publicationResult = completedPublication(finalizedResult);
    await condition(allHandlersFinished);
    return finalizedResult;
  } catch (error) {
    failure = { error };
    await condition(allHandlersFinished);
    throw error;
  }
}
