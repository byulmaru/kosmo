import { getSchema, getText } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { z } from 'zod';
import type { JSONContent } from '@tiptap/core';

export type TipTapDocument = JSONContent & { type: 'doc' };

export const tipTapExtensions = [Document, Paragraph, Text];
export const tipTapSchema = getSchema(tipTapExtensions);

const parseTipTapDocumentNode = (value: unknown) => {
  const node = tipTapSchema.nodeFromJSON(value);

  if (node.type.name !== 'doc') {
    throw new Error('TipTap document must be a doc node');
  }

  node.check();

  return node;
};

export const parseTipTapDocumentContent = (value: unknown) => {
  const node = parseTipTapDocumentNode(value);

  return {
    document: node.toJSON() as TipTapDocument,
    plainText: getText(node, { blockSeparator: '\n' }).trim(),
  };
};

export const parseTipTapDocument = (value: unknown): TipTapDocument =>
  parseTipTapDocumentContent(value).document;

export const tipTapDocumentSchema = z.unknown().transform((value, ctx) => {
  try {
    return parseTipTapDocument(value);
  }
  catch {
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid TipTap document',
    });

    return z.NEVER;
  }
});

export const extractPlainTextFromTipTapDocument = (document: TipTapDocument) =>
  parseTipTapDocumentContent(document).plainText;

export const createTipTapDocumentFromPlainText = (text: string): TipTapDocument => ({
  type: 'doc',
  content: text.split(/\r\n|\n|\r/).map((line) =>
    line
      ? {
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        }
      : { type: 'paragraph' },
  ),
});
