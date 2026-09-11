import { ActivityPubActors, db, firstOrThrow, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceKind } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { prepareProfileMigration } from '@kosmo/core/services';
import {
  federation,
  findOrMaterializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

const isExpectedSourceMaterializationError = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof ConflictError ||
  error instanceof NotFoundError;

builder.mutationField('registerProfileMigrationSource', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.OWNER }).fieldWithInput({
    type: builder.simpleObject('RegisterProfileMigrationSourcePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      sourceHandle: t.input.string(),
    },
    resolve: async (_, { input }, ctx) => {
      const targetProfileId = ctx.session.profile.id;

      const actingProfileInstance = await db
        .select({
          actorUri: ActivityPubActors.uri,
          canonicalOrigin: Instances.canonicalOrigin,
          instanceKind: Instances.kind,
        })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .where(eq(Profiles.id, targetProfileId))
        .limit(1)
        .then(firstOrThrow);

      const actingProfileOrigin =
        actingProfileInstance.instanceKind === InstanceKind.LOCAL
          ? actingProfileInstance.canonicalOrigin
          : actingProfileInstance.actorUri
            ? new URL(actingProfileInstance.actorUri).origin
            : null;
      if (!actingProfileOrigin) {
        throw new NotFoundError('Acting Profile origin not found');
      }
      let sourceProfile: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActor>>;
      try {
        sourceProfile = await findOrMaterializeRemoteProfileActor({
          context: federation.createContext(new URL(actingProfileOrigin), undefined),
          handle: input.sourceHandle,
          scheduleRefresh: () => undefined,
        });
      } catch (error) {
        if (isExpectedSourceMaterializationError(error)) {
          throw new ValidationError('원본 Profile을 찾을 수 없어요.', { field: 'sourceHandle' });
        }
        throw error;
      }

      await prepareProfileMigration({
        targetProfileId,
        sourceProfileId: sourceProfile.id,
      });

      return { profile: targetProfileId };
    },
  }),
);
