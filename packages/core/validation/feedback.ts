import { z } from 'zod';

export const feedbackBodyMaxLength = 2_000;

export const feedbackBodySchema = z
  .string()
  .trim()
  .min(1, '피드백 내용을 입력해주세요.')
  .max(feedbackBodyMaxLength, '피드백은 2,000자 이내로 입력해주세요.');
