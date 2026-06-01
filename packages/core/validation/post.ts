import { extractPlainTextFromTipTapDocument, tipTapDocumentSchema } from '../tiptap';

export const postBodyTipTapDocumentSchema = tipTapDocumentSchema
  .refine((document) => extractPlainTextFromTipTapDocument(document).length > 0, {
    message: 'Post body is required',
  })
  .refine((document) => extractPlainTextFromTipTapDocument(document).length <= 5000, {
    message: 'Post body must be at most 5000 characters',
  });
