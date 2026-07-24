import { db, first, Instances, Posts, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, PostVisibility } from '@kosmo/core/enums';
import { NotFoundError, PermissionDeniedError } from '@kosmo/core/error';
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
        const instance = await tx
          .select({ id: Instances.id })
          .from(Profiles)
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Profiles.id, ctx.session.profileId),
              eq(Instances.kind, InstanceKind.LOCAL),
              eq(Instances.state, InstanceState.ACTIVE),
            ),
          )
          .limit(1)
          .then(first);
        if (!instance) {
          throw new PermissionDeniedError();
        }

        const replyParentId = input.replyParentId?.id;
        if (replyParentId) {
          const parent = await tx
            .select({ id: Posts.id })
            .from(Posts)
            .innerJoin(Profiles, eq(Posts.profileId, Profiles.id))
            .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
            .where(and(eq(Posts.id, replyParentId), postVisibilityAccessWhere({ ctx })))
            .limit(1)
            .then(first);
          if (!parent) {
            throw new NotFoundError('Post not found');
          }
        }

        const { post } = await createPost(
          {
            document: postContentDocumentFromText(input.bodyText),
            origin: 'LOCAL',
            profileId: ctx.session.profileId,
            replyParentId,
            visibility: input.visibility,
          },
          tx,
        );

        return { post };
      }),
  }),
);
