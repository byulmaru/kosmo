import { z } from 'zod';
import { parseTipTapDocumentContent } from '../tiptap';

export const postBodyMaxLength = 500;

export const postBodyTipTapDocumentSchema = z.unknown().superRefine((value, ctx) => {
  try {
    const { plainText } = parseTipTapDocumentContent(value);

    if (plainText.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: '본문을 입력해주세요.',
      });

      return;
    }

    if (plainText.length > postBodyMaxLength) {
      ctx.addIssue({
        code: 'custom',
        message: `본문은 ${postBodyMaxLength.toLocaleString('ko-KR')}자까지 작성할 수 있어요.`,
      });
    }
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: '유효하지 않은 본문 형식입니다.',
    });
  }
});
