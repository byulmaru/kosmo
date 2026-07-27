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
import { builder } from '@/graphql/builder';
import { issueMediaStorageUpload } from '@/media/storage';
import { MediaObject } from '../ref';

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

      const upload = await issueMediaStorageUpload();
      const media = await db
        .insert(Media)
        .values({
          source: MediaSource.LOCAL,
          state: MediaState.UPLOADING,
          accountId: ctx.session.accountId,
          profileId: actor.id,
          storageReference: upload.storageReference,
          uploadExpiresAt: upload.expiresAt,
        })
        .returning()
        .then(firstOrThrowWith(() => new Error('Failed to create Uploading Media')));

      return {
        media,
        uploadUrl: upload.uploadUrl,
        expiresAt: upload.expiresAt,
      };
    },
  }),
);
