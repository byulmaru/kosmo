import { db } from '@kosmo/core/db';
import { FeedbackKind } from '@kosmo/core/enums';
import { feedbackBodySchema } from '@kosmo/core/validation';
import { deliverFeedback } from '@/feedback/delivery';
import { resolveFeedbackIdentity } from '@/feedback/identity';
import { builder } from '@/graphql/builder';

builder.mutationField('submitFeedback', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('SubmitFeedbackPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      body: t.input.string({
        validate: feedbackBodySchema,
      }),
      kind: t.input.field({ type: FeedbackKind }),
    },
    resolve: async (_, { input }, ctx) =>
      deliverFeedback(
        await resolveFeedbackIdentity(ctx.session.accountId, ctx.session.profileId, db),
        input,
      ),
  }),
);
