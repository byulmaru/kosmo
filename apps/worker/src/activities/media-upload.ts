import '@kosmo/core/polyfill';

import { db, first, Media as MediaTable } from '@kosmo/core/db';
import { MediaSource, MediaState, MediaUsePermission } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import {
  isValidMediaPublicationRights,
  matchesMediaProviderPublicationMetadata,
  mediaProviderPublicationMetadata,
} from '@kosmo/core/media-metadata';
import {
  headNexusMediaUploadSource,
  isNexusMediaUpload,
  parseNexusMediaUploadReference,
} from '@kosmo/core/media-upload';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type {
  MediaProviderPublicationMetadata,
  MediaPublicationMetadata,
  MediaPublicationRights,
} from '@kosmo/core/media-metadata';
import type {
  MediaUploadPreparationInput,
  MediaUploadResult,
} from '@kosmo/core/temporal/media-upload';

const resultSchema = z.strictObject({
  id: z.string().min(1),
  url: z.httpUrl(),
  mediaType: z.string().min(1),
  metadata: z
    .object({
      credit: z.string().min(1),
      copyright: z.string().min(1).optional(),
      usageTerms: z.string().min(1).optional(),
      webStatement: z.httpUrl().optional(),
    })
    .superRefine((metadata, context) => {
      const rightsFields = [metadata.copyright, metadata.usageTerms, metadata.webStatement].filter(
        (value) => value !== undefined,
      ).length;
      if (rightsFields !== 0 && rightsFields !== 3) {
        context.addIssue({
          code: 'custom',
          message: 'Media publication rights metadata must be complete',
        });
      }
    })
    .optional(),
});

const publicationMetadataSchema = z.object({
  attributionName: z.string().min(1),
  attributionUrl: z.httpUrl(),
  rights: z
    .object({
      personal: z.enum(MediaUsePermission),
      noncommercial: z.enum(MediaUsePermission),
      commercial: z.enum(MediaUsePermission),
    })
    .superRefine((rights, context) => {
      if (!isValidMediaPublicationRights(rights as MediaPublicationRights)) {
        context.addIssue({
          code: 'custom',
          message: 'Media publication rights are not monotone by use scope',
        });
      }
    })
    .optional(),
});

const invalidSession = () =>
  ApplicationFailure.nonRetryable(
    'Media Upload session is missing, changed, or not owned by this Account',
    'MediaUploadSessionInvalid',
  );

const publicationMetadataConflict = () =>
  ApplicationFailure.nonRetryable(
    'Media already has different publication rights; attach it again',
    'MediaUploadMetadataConflict',
  );

const parsePublicationMetadata = (value: unknown): MediaPublicationMetadata => {
  const parsed = publicationMetadataSchema.safeParse(value);
  if (!parsed.success) {
    throw publicationMetadataConflict();
  }
  return parsed.data as MediaPublicationMetadata;
};

const samePublicationRights = (
  left: MediaPublicationRights | undefined,
  right: MediaPublicationRights | undefined,
): boolean =>
  left === undefined
    ? right === undefined
    : right !== undefined &&
      left.personal === right.personal &&
      left.noncommercial === right.noncommercial &&
      left.commercial === right.commercial;

const ensureRetainedRightsCompatible = (
  retained: MediaPublicationMetadata,
  requested: MediaPublicationMetadata,
): void => {
  if (!samePublicationRights(retained.rights, requested.rights)) {
    throw publicationMetadataConflict();
  }
};

export async function prepareMediaUploadActivity(input: MediaUploadPreparationInput) {
  const { mediaId, accountId } = input;
  const requestedValue = 'publicationMetadata' in input ? input.publicationMetadata : undefined;
  const requestedMetadata =
    requestedValue === undefined ? undefined : parsePublicationMetadata(requestedValue);
  const media = await db
    .select({
      accountId: MediaTable.accountId,
      publicationMetadata: MediaTable.publicationMetadata,
      source: MediaTable.source,
      state: MediaTable.state,
      storageReference: MediaTable.storageReference,
      thumbhash: MediaTable.thumbhash,
    })
    .from(MediaTable)
    .where(eq(MediaTable.id, mediaId))
    .limit(1)
    .then(first);

  if (
    !media ||
    media.accountId !== accountId ||
    media.source !== MediaSource.LOCAL ||
    media.state !== MediaState.UPLOADING ||
    media.storageReference === null ||
    !isNexusMediaUpload(media.storageReference)
  ) {
    throw invalidSession();
  }

  const storageReference = media.storageReference;
  try {
    const source = await headNexusMediaUploadSource(storageReference);

    let appliedMetadata =
      media.publicationMetadata === null
        ? undefined
        : parsePublicationMetadata(media.publicationMetadata);
    if (appliedMetadata !== undefined && requestedMetadata !== undefined) {
      ensureRetainedRightsCompatible(appliedMetadata, requestedMetadata);
    }
    if (appliedMetadata === undefined && requestedMetadata !== undefined) {
      const stored = await db
        .update(MediaTable)
        .set({ publicationMetadata: requestedMetadata })
        .where(
          and(
            eq(MediaTable.id, mediaId),
            eq(MediaTable.accountId, accountId),
            eq(MediaTable.source, MediaSource.LOCAL),
            eq(MediaTable.state, MediaState.UPLOADING),
            eq(MediaTable.storageReference, storageReference),
            isNull(MediaTable.publicationMetadata),
          ),
        )
        .returning({ publicationMetadata: MediaTable.publicationMetadata })
        .then(first);
      if (stored?.publicationMetadata) {
        appliedMetadata = parsePublicationMetadata(stored.publicationMetadata);
      } else {
        const current = await db
          .select({
            accountId: MediaTable.accountId,
            publicationMetadata: MediaTable.publicationMetadata,
            source: MediaTable.source,
            state: MediaTable.state,
            storageReference: MediaTable.storageReference,
          })
          .from(MediaTable)
          .where(eq(MediaTable.id, mediaId))
          .limit(1)
          .then(first);
        if (
          !current ||
          current.accountId !== accountId ||
          current.source !== MediaSource.LOCAL ||
          current.state !== MediaState.UPLOADING ||
          current.storageReference !== storageReference
        ) {
          throw invalidSession();
        }
        if (current.publicationMetadata === null) {
          throw publicationMetadataConflict();
        }
        appliedMetadata = parsePublicationMetadata(current.publicationMetadata);
        ensureRetainedRightsCompatible(appliedMetadata, requestedMetadata);
      }
    }

    if (media.thumbhash === null && source.thumbhash !== undefined) {
      await db
        .update(MediaTable)
        .set({ thumbhash: source.thumbhash })
        .where(
          and(
            eq(MediaTable.id, mediaId),
            eq(MediaTable.accountId, accountId),
            eq(MediaTable.source, MediaSource.LOCAL),
            eq(MediaTable.state, MediaState.UPLOADING),
            eq(MediaTable.storageReference, storageReference),
            isNull(MediaTable.thumbhash),
          ),
        );
    }
    return {
      id: source.id,
      sourceKey: source.sourceKey,
      contentType: source.contentType,
      ...(requestedMetadata === undefined || appliedMetadata === undefined
        ? {}
        : { publicationMetadata: appliedMetadata }),
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw ApplicationFailure.nonRetryable(error.message, 'NexusMediaUploadSourceError');
    }
    throw error;
  }
}

type FinalizeMediaUploadInput = MediaUploadPreparationInput & {
  readonly applyAiProhibitFilter?: boolean;
  readonly expectedPublicationMetadata?: MediaProviderPublicationMetadata;
  readonly remoteUploadId: string;
  readonly result: MediaUploadResult;
};

const requirePublicationMetadata = (
  actual: MediaProviderPublicationMetadata | undefined,
  expected: MediaProviderPublicationMetadata,
): void => {
  if (!matchesMediaProviderPublicationMetadata(actual, expected)) {
    throw ApplicationFailure.nonRetryable(
      'Media publication metadata receipt does not match the applied metadata',
      'MediaUploadMetadataConflict',
    );
  }
};

export async function finalizeMediaUploadActivity(input: FinalizeMediaUploadInput) {
  const result = resultSchema.safeParse(input.result);
  if (!result.success || result.data.id !== input.remoteUploadId) {
    throw ApplicationFailure.nonRetryable(
      'Media Upload result does not match the prepared session',
      'MediaUploadResultInvalid',
    );
  }

  const media = await db
    .select()
    .from(MediaTable)
    .where(eq(MediaTable.id, input.mediaId))
    .limit(1)
    .then(first);
  if (!media || media.accountId !== input.accountId || media.source !== MediaSource.LOCAL) {
    throw invalidSession();
  }

  if (
    media.storageReference === null ||
    parseNexusMediaUploadReference(media.storageReference)?.id !== input.remoteUploadId
  ) {
    throw invalidSession();
  }

  if (input.expectedPublicationMetadata !== undefined) {
    requirePublicationMetadata(result.data.metadata, input.expectedPublicationMetadata);
    if (media.publicationMetadata === null) {
      throw publicationMetadataConflict();
    }
    const currentMetadata = parsePublicationMetadata(media.publicationMetadata);
    requirePublicationMetadata(
      mediaProviderPublicationMetadata(currentMetadata),
      input.expectedPublicationMetadata,
    );
  }

  if (media.state === MediaState.READY) {
    if (media.url === result.data.url && media.mediaType === result.data.mediaType) {
      return result.data;
    }
    throw invalidSession();
  }
  if (media.state !== MediaState.UPLOADING) {
    throw invalidSession();
  }

  const storageReference = media.storageReference;
  const completed = await db
    .update(MediaTable)
    .set({
      ...(input.applyAiProhibitFilter === undefined
        ? {}
        : { aiProhibitFilterApplied: input.applyAiProhibitFilter }),
      mediaType: result.data.mediaType,
      url: result.data.url,
      readyAt: Temporal.Now.instant(),
      state: MediaState.READY,
    })
    .where(
      and(
        eq(MediaTable.id, input.mediaId),
        eq(MediaTable.accountId, input.accountId),
        eq(MediaTable.source, MediaSource.LOCAL),
        eq(MediaTable.state, MediaState.UPLOADING),
        eq(MediaTable.storageReference, storageReference),
      ),
    )
    .returning({ id: MediaTable.id })
    .then(first);
  if (completed) {
    return result.data;
  }

  const current = await db
    .select()
    .from(MediaTable)
    .where(
      and(
        eq(MediaTable.id, input.mediaId),
        eq(MediaTable.accountId, input.accountId),
        eq(MediaTable.source, MediaSource.LOCAL),
        eq(MediaTable.state, MediaState.READY),
      ),
    )
    .limit(1)
    .then(first);
  if (current?.url === result.data.url && current.mediaType === result.data.mediaType) {
    return result.data;
  }

  throw invalidSession();
}
