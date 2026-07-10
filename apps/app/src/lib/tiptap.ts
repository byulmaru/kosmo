import type { TipTapDocument, TipTapParagraph } from '@/types/graphql';

export function createTipTapDocumentFromPlainText(text: string): TipTapDocument {
  return {
    type: 'doc',
    content: text.split(/\r\n|\n|\r/).map((line): TipTapParagraph => {
      if (line.length === 0) {
        return { type: 'paragraph' };
      }

      return {
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      };
    }),
  };
}

export function extractPlainTextFromTipTapDocument(document: TipTapDocument): string {
  return (document.content ?? [])
    .map((paragraph) => (paragraph.content ?? []).map((text) => text.text).join(''))
    .join('\n')
    .trim();
}
