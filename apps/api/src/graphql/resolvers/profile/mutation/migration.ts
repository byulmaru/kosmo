import { ConflictError, NotFoundError, ValidationError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { assertProfileMigrationTarget, prepareProfileMigration } from '@kosmo/core/services';
import {
  federation,
  findOrMaterializeRemoteProfileActor,
  RemoteActorMaterializationError,
} from '@kosmo/fedify';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

const isExpectedSourceMaterializationError = (error: unknown) =>
  error instanceof RemoteActorMaterializationError ||
  error instanceof ConflictError ||
  error instanceof NotFoundError;

builder.mutationField('prepareProfileMigration', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('PrepareProfileMigrationPayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      profileId: t.input.globalID({ for: Profile }),
      sourceHandle: t.input.string(),
    },
    resolve: async (_, { input }, ctx) => {
      const targetInput = {
        accountId: ctx.session.accountId,
        targetProfileId: input.profileId.id,
      };

      // Authorize and validate the target before materializing any remote
      // source, so a rejected request cannot create a Remote Profile.
      await assertProfileMigrationTarget(targetInput);

      const localInstance = await resolveConfiguredLocalInstance();
      let sourceProfile: Awaited<ReturnType<typeof findOrMaterializeRemoteProfileActor>>;
      try {
        sourceProfile = await findOrMaterializeRemoteProfileActor({
          context: federation.createContext(new URL(localInstance.canonicalOrigin), undefined),
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
