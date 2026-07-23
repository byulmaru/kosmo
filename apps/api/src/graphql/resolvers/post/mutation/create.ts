import { AccountProfiles, Accounts, db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import {
  AccountState,
  InstanceKind,
  InstanceState,
  PostVisibility,
  ProfileState,
} from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { createPost } from '@kosmo/core/services';
import { postBodyTextSchema } from '@kosmo/core/validation';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { postVisibilityAccessWhere } from '../access/visibility';
import { Post } from '../ref';

builder.mutationField('createPost', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('CreatePostPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
    input: {
      bodyText: t.input.string({ validate: postBodyTextSchema }),
      replyParentId: t.input.globalID({ for: Post, required: false }),
      visibility: t.input.field({ type: PostVisibility }),
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
              eq(Instances.kind, InstanceKind.LOCAL),
              eq(Instances.state, InstanceState.ACTIVE),
            ),
          )
          .limit(1)
          .then(first);
        if (!actor) {
          throw new PermissionDeniedError();
        }

        let replyParentId: string | undefined;
        if (input.replyParentId) {
          const parent = await tx
            .select({ currentContentId: Posts.currentContentId, id: Posts.id })
            .from(Posts)
            .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(and(eq(Posts.id, input.replyParentId.id), postVisibilityAccessWhere({ ctx })))
            .limit(1)
            .then(first);
          if (!parent) {
            throw new NotFoundError('Post not found');
          }
          if (parent.currentContentId === null) {
            throw new ValidationError('Reply Parent must have content', {
              field: 'replyParentId',
            });
          }
          replyParentId = parent.id;
        }

        const { post } = await createPost(
          {
            document: postContentDocumentFromText(input.bodyText),
            origin: 'LOCAL',
            profileId: actor.id,
            replyParentId,
            visibility: input.visibility,
          },
          tx,
        );

        return { post };
      }),
  }),
);
