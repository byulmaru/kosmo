import { AccountProfiles, Accounts, db, first, Instances, Profiles } from '@kosmo/core/db';
import {
  AccountProfileRole,
  AccountState,
  InstanceKind,
  InstanceState,
  ProfileState,
} from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { repostPost } from '@kosmo/core/services';
import { and, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('repostPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('RepostPostPayload', {
      fields: (field) => ({
        repost: field.field({ type: Post }),
      }),
    }),
    input: {
      sourceId: t.input.globalID({ for: Post }),
    },
    resolve: async (_, { input }, ctx) =>
      db.transaction(async (tx) => {
        const actor = await tx
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
              inArray(AccountProfiles.role, [AccountProfileRole.OWNER, AccountProfileRole.MEMBER]),
              eq(Instances.kind, InstanceKind.LOCAL),
              eq(Instances.state, InstanceState.ACTIVE),
            ),
          )
          .limit(1)
          .then(first);
        if (!actor) {
          throw new PermissionDeniedError();
        }

        return {
          repost: await repostPost(
            {
              actorProfileId: actor.id,
              sourcePostId: input.sourceId.id,
            },
            tx,
          ),
        };
      }),
  }),
);
