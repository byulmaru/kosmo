import {
  isValidMediaPublicationRights,
  matchesMediaProviderPublicationMetadata,
  mediaProviderPublicationMetadata,
  MediaUsePermission,
} from '@kosmo/core/media-metadata';
import {
  MEDIA_UPLOAD_MAX_BYTES,
  MEDIA_UPLOAD_MAX_DIMENSION,
  MEDIA_UPLOAD_METADATA_PUBLISH_UPDATE_NAME,
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
  MediaProviderPublicationMetadata,
  MediaPublicationMetadata,
  MediaPublicationRights,
} from '@kosmo/core/media-metadata';
import type { NexusMediaUploadContentType } from '@kosmo/core/media-upload';
import type {
  MediaUploadPreparationInput,
  MediaUploadPublishInput,
  MediaUploadPublishResult,
  MediaUploadResult,
  MediaUploadWithMetadataWorkflowInput,
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
    {
      readonly id: string;
      readonly applyAiProhibitFilter: boolean;
      readonly metadata?: MediaProviderPublicationMetadata;
    },
    MediaUploadPublishResult
  >(),
});

const { prepareMediaUploadActivity, finalizeMediaUploadActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const mediaRightsSchema = z
  .object({
    commercial: z.enum(MediaUsePermission),
    noncommercial: z.enum(MediaUsePermission),
    personal: z.enum(MediaUsePermission),
  })
  .superRefine((rights, context) => {
    if (!isValidMediaPublicationRights(rights as MediaPublicationRights)) {
      context.addIssue({
        code: 'custom',
        message: 'Media publication rights are not monotone by use scope',
      });
    }
  });

const publicationMetadataSchema = z.object({
  attributionName: z.string().min(1),
  attributionUrl: z.httpUrl(),
  rights: mediaRightsSchema.optional(),
});

const providerPublicationMetadataSchema = z
  .object({
    credit: z.string().min(1),
    copyright: z.string().min(1).optional(),
    usageTerms: z.string().min(1).optional(),
    webStatement: z.httpUrl().optional(),
  })
  .superRefine((metadata, context) => {
    const suppliedRightsFields = [
      metadata.copyright,
      metadata.usageTerms,
      metadata.webStatement,
    ].filter((value) => value !== undefined).length;
    if (suppliedRightsFields !== 0 && suppliedRightsFields !== 3) {
      context.addIssue({
        code: 'custom',
        message: 'Media publication rights metadata must be complete',
      });
    }
  });

const legacyInputSchema = z.object({
  mediaId: z.uuid(),
  accountId: z.uuid(),
  applyAiProhibitFilter: z.boolean().optional(),
  applyNightshade: z.boolean().default(false),
});

const metadataInputSchema = z.object({
  mediaId: z.uuid(),
  accountId: z.uuid(),
  applyAiProhibitFilter: z.boolean(),
  publicationMetadata: publicationMetadataSchema,
});

const publishInputSchema = z.object({ applyAiProhibitFilter: z.boolean() });

const completedPublication = ({
  id,
  mediaType,
  url,
}: MediaUploadResult): MediaUploadPublishResult => ({ id, mediaType, status: 'completed', url });

const completedPublicationWithMetadata = ({
  id,
  mediaType,
  metadata,
  url,
}: MediaUploadResult): MediaUploadPublishResult => ({
  id,
  mediaType,
  ...(metadata === undefined ? {} : { metadata }),
  status: 'completed',
  url,
});

const requirePublicationMetadataReceipt = (
  value: unknown,
  expected: MediaProviderPublicationMetadata,
): void => {
  const receipt = providerPublicationMetadataSchema.safeParse(value);
  if (!receipt.success || !matchesMediaProviderPublicationMetadata(receipt.data, expected)) {
    throw ApplicationFailure.nonRetryable(
      'Media publication metadata receipt does not match the applied metadata',
      'MediaUploadMetadataConflict',
    );
  }
};

type WorkflowState = {
  failure: { readonly error: unknown } | undefined;
  publicationResult: MediaUploadPublishResult | undefined;
};

const registerPublishUpdate = (
  updateName: string,
  selectedFilter: boolean,
  state: WorkflowState,
): void => {
  setHandler(
    defineUpdate<MediaUploadPublishResult, [MediaUploadPublishInput]>(updateName),
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

      await condition(() => state.failure !== undefined || state.publicationResult !== undefined);
      if (state.failure) {
        throw state.failure.error;
      }
      return state.publicationResult!;
    },
  );
};

async function runMediaUploadWorkflow(
  input: MediaUploadWorkflowInput | MediaUploadWithMetadataWorkflowInput,
  mode: 'legacy' | 'metadata',
): Promise<MediaUploadWorkflowResult> {
  const parsed =
    mode === 'metadata' ? metadataInputSchema.safeParse(input) : legacyInputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Media Upload workflow input is invalid',
      'MediaUploadWorkflowInputInvalid',
    );
  }

  const client = createNexusServiceClient({ service: mediaService, endpoint: 'media-upload' });
  const applyAiProhibitFilter = parsed.data.applyAiProhibitFilter;
  const isNewInput = applyAiProhibitFilter !== undefined;
  const legacyNightshade =
    mode === 'legacy' ? (parsed.data as z.output<typeof legacyInputSchema>).applyNightshade : false;
  const selectedFilter = applyAiProhibitFilter ?? legacyNightshade;
  const state: WorkflowState = { failure: undefined, publicationResult: undefined };

  registerPublishUpdate(MEDIA_UPLOAD_PUBLISH_UPDATE_NAME, selectedFilter, state);
  if (mode === 'metadata') {
    registerPublishUpdate(MEDIA_UPLOAD_METADATA_PUBLISH_UPDATE_NAME, selectedFilter, state);
  }

  try {
    const prepareInput = parsed.data as MediaUploadPreparationInput;
    const prepared = await prepareMediaUploadActivity(prepareInput);
    let publicationMetadata: MediaProviderPublicationMetadata | undefined;
    if (mode === 'metadata') {
      const metadata = publicationMetadataSchema.safeParse(prepared.publicationMetadata);
      if (!metadata.success) {
        throw ApplicationFailure.nonRetryable(
          'Persisted Media publication metadata is missing or invalid',
          'MediaUploadMetadataConflict',
        );
      }
      const providerMetadata = providerPublicationMetadataSchema.safeParse(
        mediaProviderPublicationMetadata(metadata.data as MediaPublicationMetadata),
      );
      if (!providerMetadata.success) {
        throw ApplicationFailure.nonRetryable(
          'Media publication metadata cannot be sent to the Media Storage Service',
          'MediaUploadMetadataConflict',
        );
      }
      publicationMetadata = providerMetadata.data;
    }

    const startUploadInput: ProcessUploadInput = {
      id: prepared.id,
      sourceKey: prepared.sourceKey,
      contentType: prepared.contentType,
      maxBytes: MEDIA_UPLOAD_MAX_BYTES,
      maxDimension: MEDIA_UPLOAD_MAX_DIMENSION,
    };
    const upload = await client.startOperation('startUpload', startUploadInput, {
      scheduleToCloseTimeout: '25 hours',
    });

    let finalizedResult: MediaUploadWorkflowResult | undefined;
    if (mode === 'metadata' || isNewInput) {
      const publication = await client.executeOperation(
        'publishUploadV2',
        {
          id: prepared.id,
          applyAiProhibitFilter: selectedFilter,
          ...(publicationMetadata === undefined ? {} : { metadata: publicationMetadata }),
        },
        { scheduleToCloseTimeout: '25 hours' },
      );

      if (publication.status === 'processing') {
        state.publicationResult = publication;
      } else {
        if (publicationMetadata !== undefined) {
          requirePublicationMetadataReceipt(publication.metadata, publicationMetadata);
        }
        const finalized = await finalizeMediaUploadActivity({
          ...parsed.data,
          remoteUploadId: prepared.id,
          ...(isNewInput ? { applyAiProhibitFilter: selectedFilter } : {}),
          ...(publicationMetadata === undefined
            ? {}
            : { expectedPublicationMetadata: publicationMetadata }),
          result: {
            id: publication.id,
            ...(publication.metadata === undefined ? {} : { metadata: publication.metadata }),
            mediaType: publication.mediaType,
            url: publication.url,
          },
        });
        finalizedResult = { ...finalized, applyAiProhibitFilter: selectedFilter };
        state.publicationResult =
          mode === 'metadata'
            ? completedPublicationWithMetadata(publication)
            : completedPublication(publication);
      }
    } else {
      if (selectedFilter) {
        state.publicationResult = { id: prepared.id, status: 'processing' };
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
    if (publicationMetadata !== undefined && !finalizedResult) {
      requirePublicationMetadataReceipt(uploadResult.metadata, publicationMetadata);
    }
    if (!finalizedResult) {
      const finalized = await finalizeMediaUploadActivity({
        ...parsed.data,
        remoteUploadId: prepared.id,
        ...(isNewInput ? { applyAiProhibitFilter: selectedFilter } : {}),
        ...(publicationMetadata === undefined
          ? {}
          : { expectedPublicationMetadata: publicationMetadata }),
        result: uploadResult,
      });
      finalizedResult = {
        ...finalized,
        ...(isNewInput ? { applyAiProhibitFilter: selectedFilter } : {}),
      };
    }
    state.publicationResult =
      mode === 'metadata'
        ? completedPublicationWithMetadata(finalizedResult)
        : completedPublication(finalizedResult);
    await condition(allHandlersFinished);
    return finalizedResult;
  } catch (error) {
    state.failure = { error };
    await condition(allHandlersFinished);
    throw error;
  }
}

export const runLegacyMediaUploadWorkflow = (input: MediaUploadWorkflowInput) =>
  runMediaUploadWorkflow(input, 'legacy');

export const runMediaUploadWithMetadataWorkflow = (input: MediaUploadWithMetadataWorkflowInput) =>
  runMediaUploadWorkflow(input, 'metadata');
