import { z } from 'zod';
import { deliverFeedback } from '@/feedback/delivery';
import { resolveFeedbackIdentity } from '@/feedback/identity';
import { builder } from '@/graphql/builder';
import { FeedbackKind } from '@/graphql/enums';

builder.mutationField('submitFeedback', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('SubmitFeedbackPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    input: {
      body: t.input.string({
        validate: z
          .string()
          .transform((value) => value.trim())
          .pipe(
            z
              .string()
              .min(1, '본문을 입력해주세요.')
              .max(2000, '본문은 2,000자까지 작성할 수 있어요.'),
          ),
      }),
      kind: t.input.field({ type: FeedbackKind }),
    },
    resolve: async (_, { input }, ctx) =>
      deliverFeedback(
        await resolveFeedbackIdentity(ctx.session.accountId, ctx.session.profileId),
        input,
      ),
  }),
);
