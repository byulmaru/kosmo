import '@kosmo/core/polyfill';

import { db, first, Media as MediaTable } from '@kosmo/core/db';
import { MediaSource, MediaState } from '@kosmo/core/enums';
import {
  headNexusMediaUploadSource,
  isNexusMediaUpload,
  NexusMediaUploadSourceError,
  parseNexusMediaUploadReference,
} from '@kosmo/core/media-upload';
import { ApplicationFailure } from '@temporalio/activity';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

const resultSchema = z.strictObject({
  id: z.string().min(1),
  url: z.httpUrl(),
  mediaType: z.string().min(1),
});

const invalidSession = () =>
  ApplicationFailure.nonRetryable(
    'Media Upload session is missing, changed, or not owned by this Account',
    'MediaUploadSessionInvalid',
  );

export async function prepareMediaUploadActivity({ mediaId, accountId }: MediaUploadWorkflowInput) {
  const media = await db
    .select({
      accountId: MediaTable.accountId,
      source: MediaTable.source,
      state: MediaTable.state,
      storageReference: MediaTable.storageReference,
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
    return await headNexusMediaUploadSource(storageReference);
  } catch (error) {
    if (error instanceof NexusMediaUploadSourceError) {
      throw ApplicationFailure.nonRetryable(
        error.message,
        'NexusMediaUploadSourceError',
        error.code,
      );
    }
    throw error;
  }
}

type FinalizeMediaUploadInput = MediaUploadWorkflowInput & {
  readonly remoteUploadId: string;
  readonly result: MediaUploadWorkflowResult;
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
