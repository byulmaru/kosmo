import { ValidationError } from '@kosmo/core/error';
import { z } from 'zod';
import { deliverFeedback } from '@/feedback/delivery';
import { builder } from '@/graphql/builder';
import { FeedbackKind } from '@/graphql/enums';

const sentryEventIdSchema = z
  .string()
  .regex(/^[\da-f]{32}$/iu, 'Sentry event ID 형식이 올바르지 않아요.');

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
      sentryEventId: t.input.string({
        required: false,
        validate: sentryEventIdSchema.nullable().optional(),
      }),
    },
    resolve: async (_, { input }, ctx) => {
      if (input.kind !== 'BUG_REPORT' && input.sentryEventId != null) {
        throw new ValidationError('버그 피드백에서만 Sentry event ID를 입력할 수 있어요.', {
          field: 'sentryEventId',
        });
      }

      return deliverFeedback(ctx.session.accountId, {
        body: input.body,
        kind: input.kind,
        sentryEventId: input.sentryEventId?.toLowerCase() ?? null,
      });
    },
  }),
);
