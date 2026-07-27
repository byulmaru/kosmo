import {
  AccountProfiles,
  Accounts,
  db,
  first,
  firstOrThrowWith,
  Instances,
  Media,
  Profiles,
} from '@kosmo/core/db';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  ProfileState,
} from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { MediaObject } from '../ref';

const uploadResponseSchema = z.object({
  id: z.string().min(1),
  uploadUrl: z.url(),
  expiresAt: z.string(),
});

const mediaStorageConfigSchema = z.object({
  MEDIA_STORAGE_SERVICE_ORIGIN: z.url(),
  MEDIA_STORAGE_SERVICE_API_KEY: z.string().min(1),
});

const MEDIA_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

builder.mutationField('issueMediaUploadUrl', (t) =>
  t.withAuth({ usingProfile: true }).field({
    type: builder.simpleObject('IssueMediaUploadUrlPayload', {
      fields: (field) => ({
        media: field.field({ type: MediaObject }),
        uploadUrl: field.string(),
        expiresAt: field.field({ type: 'DateTime' }),
      }),
    }),
    resolve: async (_, __, ctx) => {
      const actor = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .innerJoin(
          AccountProfiles,
          and(
            eq(AccountProfiles.profileId, Profiles.id),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .innerJoin(Accounts, eq(Accounts.id, AccountProfiles.accountId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(Profiles.id, ctx.session.profileId),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Accounts.state, AccountState.ACTIVE),
            eq(Instances.kind, InstanceKind.LOCAL),
            eq(Instances.state, InstanceState.ACTIVE),
          ),
        )
        .limit(1)
        .then(first);
      if (!actor) {
        throw new PermissionDeniedError();
      }

      const config = mediaStorageConfigSchema.safeParse(process.env);
      if (!config.success) {
        throw new Error('Media Storage Service is not configured');
      }

      const response = await globalThis.fetch(
        new URL('/v1/uploads', config.data.MEDIA_STORAGE_SERVICE_ORIGIN),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.data.MEDIA_STORAGE_SERVICE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.any([
            ctx.c.req.raw.signal,
            AbortSignal.timeout(MEDIA_STORAGE_REQUEST_TIMEOUT_MS),
          ]),
        },
      );
      if (response.status !== 201) {
        throw new Error(`Media Storage Service rejected upload issuance (${response.status})`);
      }

      const upload = uploadResponseSchema.safeParse(await response.json());
      if (!upload.success) {
        throw new Error('Media Storage Service returned an invalid upload response');
      }
      const expiresAt = Temporal.Instant.from(upload.data.expiresAt);

      const media = await db
        .insert(Media)
        .values({
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          accountId: ctx.session.accountId,
          profileId: actor.id,
          storageReference: upload.data.id,
          uploadExpiresAt: expiresAt,
        })
        .returning()
        .then(firstOrThrowWith(() => new Error('Failed to create Uploading Media')));

      return {
        media,
        uploadUrl: upload.data.uploadUrl,
        expiresAt,
      };
    },
  }),
);
