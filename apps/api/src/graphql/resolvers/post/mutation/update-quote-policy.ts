import { AccountProfileRole, PostQuotePolicy } from '@kosmo/core/enums';
import { updatePostQuotePolicy } from '@kosmo/core/services';
import { builder } from '@/graphql/builder';
import { Post } from '../ref';

builder.mutationField('updatePostQuotePolicy', (t) =>
  t.withAuth({ profileRole: AccountProfileRole.MEMBER }).fieldWithInput({
    type: builder.simpleObject('UpdatePostQuotePolicyPayload', {
      fields: (field) => ({
        post: field.field({ type: Post }),
      }),
    }),
    input: {
      id: t.input.globalID({ for: Post }),
      quotePolicy: t.input.field({ type: PostQuotePolicy }),
    },
    resolve: async (_, { input }, ctx) => {
      await updatePostQuotePolicy({
        actorProfileId: ctx.session.profile.id,
        policy: input.quotePolicy,
        postId: input.id.id,
      });

      return { post: input.id.id };
    },
  }),
);
