import { z } from 'zod';
import { ContentReportReason } from '../enums';

export const contentReportDetailsMaxLength = 2_000;

const contentReportDetailsSchema = z
  .string()
  .trim()
  .max(contentReportDetailsMaxLength, '신고 상세 내용은 2,000자 이내로 입력해주세요.')
  .transform((details) => details || undefined)
  .optional();

export const contentReportInputSchema = z
  .object({
    reason: z.enum(Object.values(ContentReportReason)),
    details: contentReportDetailsSchema,
  })
  .superRefine(({ reason, details }, context) => {
    if (reason === ContentReportReason.OTHER && !details) {
      context.addIssue({
        code: 'custom',
        path: ['details'],
        message: '기타 사유를 선택한 경우 상세 내용을 입력해주세요.',
      });
    }
  });
