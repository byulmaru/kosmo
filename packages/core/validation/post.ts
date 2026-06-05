import { z } from 'zod';
import { parseTipTapDocumentContent } from '../tiptap';

export const postBodyTipTapDocumentSchema = z.unknown().transform((value, ctx) => {
  try {
    const { document, plainText } = parseTipTapDocumentContent(value);

    if (plainText.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Post body is required',
      });

      return z.NEVER;
    }

    if (plainText.length > 5000) {
      ctx.addIssue({
        code: 'custom',
        message: 'Post body must be at most 5000 characters',
      });

      return z.NEVER;
    }

    return document;
  } catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid TipTap document',
    });

    return z.NEVER;
  }
});
