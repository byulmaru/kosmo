import { db, firstOrThrow, Instances, Profiles } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { assertProfileMigrationTarget, prepareProfileMigration } from '@kosmo/core/services';
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
      const targetInput = {
        targetProfileId: ctx.session.profile.id,
      };

      // Authorize and validate the target before materializing any remote
      // source, so a rejected request cannot create a Remote Profile.
      await assertProfileMigrationTarget(targetInput);

      const actingProfileInstance = await db
        .select({ canonicalOrigin: Instances.canonicalOrigin })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(eq(Profiles.id, targetInput.targetProfileId))
        .limit(1)
        .then(firstOrThrow);
      if (!actingProfileInstance.canonicalOrigin) {
        throw new NotFoundError('Acting Profile origin not found');
      }
      const actingProfileOrigin = new URL(actingProfileInstance.canonicalOrigin);
      let sourceProfile: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActor>>;
      try {
        sourceProfile = await findOrMaterializeRemoteProfileActor({
          context: federation.createContext(actingProfileOrigin, undefined),
          handle: input.sourceHandle,
          scheduleRefresh: () => undefined,
        });
      } catch (error) {
        if (isExpectedSourceMaterializationError(error)) {
          throw new ValidationError('원본 Profile을 찾을 수 없어요.', { field: 'sourceHandle' });
        }
        throw error;
      }

      const result = await prepareProfileMigration({
        ...targetInput,
        sourceProfileId: sourceProfile.id,
      });

      return { profile: result };
    },
  }),
);
