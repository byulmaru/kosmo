import {
  ContentReportDeliveryStatus,
  ContentReportReason,
  ContentReportTargetType,
} from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { contentReportInputSchema } from '@kosmo/core/validation';
import { deliverContentReport } from '@/content-report/delivery';
import { resolveContentReportTarget } from '@/content-report/target';
import { builder } from '@/graphql/builder';

builder.mutationField('submitContentReport', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('SubmitContentReportPayload', {
      fields: (field) => ({
        status: field.field({ type: ContentReportDeliveryStatus }),
      }),
    }),
    input: {
      details: t.input.string({ required: false }),
      reason: t.input.field({ type: ContentReportReason }),
      targetId: t.input.string(),
      targetType: t.input.field({ type: ContentReportTargetType }),
    },
    resolve: async (_, { input }, ctx) => {
      const parsedInput = contentReportInputSchema.safeParse({
        details: input.details ?? undefined,
        reason: input.reason,
      });
      if (!parsedInput.success) {
        const issue = parsedInput.error.issues[0];
        throw new ValidationError(issue?.message ?? '신고 내용을 확인해주세요.', {
          field: issue?.path.join('.') || undefined,
        });
      }

      const target = await resolveContentReportTarget(
        { id: input.targetId, kind: input.targetType },
        ctx,
      );
      if (!target) {
        return { status: ContentReportDeliveryStatus.REJECTED };
      }

      return {
        status: await deliverContentReport({
          ...parsedInput.data,
          target,
        }),
      };
    },
  }),
);
