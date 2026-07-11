import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTipTapDocumentFromPlainText, extractPlainTextFromTipTapDocument } from './tiptap';

describe('TipTap plain-text adapter', () => {
  it('creates one paragraph per line without a DOM dependency', () => {
    assert.deepEqual(createTipTapDocumentFromPlainText('첫 줄\n\n셋째 줄'), {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '첫 줄' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: '셋째 줄' }] },
      ],
    });
  });

  it('extracts the current doc/paragraph/text subset', () => {
    assert.equal(
      extractPlainTextFromTipTapDocument({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '첫 줄' }] },
          { type: 'paragraph' },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '셋째' },
              { type: 'text', text: ' 줄' },
            ],
          },
        ],
      }),
      '첫 줄\n\n셋째 줄',
    );
  });
});
