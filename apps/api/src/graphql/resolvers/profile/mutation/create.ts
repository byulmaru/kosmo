import { AccountProfiles, db, firstOrThrow, isUniqueViolation, Profiles } from '@kosmo/core/db';
import {
  AccountProfileRole,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { ConflictError, ProfileLimitExceededError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { normalizeHandle } from '@kosmo/core/utils';
import { localProfileHandleSchema } from '@kosmo/core/validation';
import { and, count, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';
import { Profile } from '../ref';

const MAX_ACCOUNT_OWNED_PROFILES = 10;
const MAX_SERIALIZATION_RETRIES = 2;

const getPostgresErrorCode = (error: unknown): unknown =>
  error && typeof error === 'object' && 'code' in error ? error.code : undefined;

const isSerializationFailure = (error: unknown) =>
  getPostgresErrorCode(error) === '40001' ||
  (error && typeof error === 'object' && 'cause' in error
    ? getPostgresErrorCode(error.cause) === '40001'
    : false);

builder.mutationField('createProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('CreateProfilePayload', {
      fields: (field) => ({
        account: field.field({ type: Account }),
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      handle: t.input.string({ validate: localProfileHandleSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const localInstance = await resolveConfiguredLocalInstance();
      const createProfile = () =>
        db.transaction(
          async (tx) => {
            const [ownedProfileCount] = await tx
              .select({ value: count() })
              .from(AccountProfiles)
              .innerJoin(Profiles, eq(AccountProfiles.profileId, Profiles.id))
              .where(
                and(
                  eq(AccountProfiles.accountId, ctx.session.accountId),
                  eq(AccountProfiles.role, AccountProfileRole.OWNER),
                  inArray(Profiles.state, [ProfileState.ACTIVE, ProfileState.SUSPENDED]),
                ),
              );

            if (ownedProfileCount.value >= MAX_ACCOUNT_OWNED_PROFILES) {
              throw new ProfileLimitExceededError();
            }

            const profile = await tx
              .insert(Profiles)
              .values({
                handle: input.handle,
                instanceId: localInstance.id,
                normalizedHandle: normalizeHandle(input.handle),
                displayName: input.handle,
                defaultPostVisibility: PostVisibility.UNLISTED,
                followPolicy: ProfileFollowPolicy.OPEN,
              })
              .returning()
              .then(firstOrThrow)
              .catch((error) => {
                if (isUniqueViolation(error)) {
                  throw new ConflictError({
                    message: '이미 사용 중인 핸들이에요.',
                    field: 'handle',
                  });
                }

                throw error;
              });

            await tx.insert(AccountProfiles).values({
              accountId: ctx.session.accountId,
              profileId: profile.id,
              role: AccountProfileRole.OWNER,
            });

            return profile;
          },
          { isolationLevel: 'serializable' },
        );

      let retriesRemaining = MAX_SERIALIZATION_RETRIES;
      let profile: Awaited<ReturnType<typeof createProfile>>;

      while (true) {
        try {
          profile = await createProfile();
          break;
        } catch (error) {
          if (!isSerializationFailure(error) || retriesRemaining === 0) {
            throw error;
          }

          retriesRemaining -= 1;
        }
      }

      return { account: ctx.session.accountId, profile };
    },
  }),
);
