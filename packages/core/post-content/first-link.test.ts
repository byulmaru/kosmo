import assert from 'node:assert/strict';
import test from 'node:test';
import { getPostContentLinkPreviewUrl } from './index';
import type { PostContentDocumentV1, PostContentLinkMark } from './index';

const link = (href: string): PostContentLinkMark => ({
  type: 'link',
  attrs: { href },
});

test('returns the first link mark in document order', () => {
  const document: PostContentDocumentV1 = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'unlinked text ' },
            { type: 'text', text: 'first', marks: [link('https://example.com/first')] },
            { type: 'text', text: 'second', marks: [link('https://example.com/second')] },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'third', marks: [link('https://example.com/third')] }],
        },
      ],
    },
  };

  assert.equal(getPostContentLinkPreviewUrl(document), 'https://example.com/first');
});

test('returns null when the document has no link marks', () => {
  const document: PostContentDocumentV1 = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'https://example.com/plain text' }] },
      ],
    },
  };

  assert.equal(getPostContentLinkPreviewUrl(document), null);
});

test('returns null when the body contains media, even when it has a link', () => {
  const document: PostContentDocumentV1 = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'link', marks: [link('https://example.com/first')] }],
        },
        { type: 'media', attrs: { mediaId: '019f6678-86fa-709b-984e-1520766b8447' } },
      ],
    },
  };

  assert.equal(getPostContentLinkPreviewUrl(document), null);
});

test('returns null for an invalid document', () => {
  assert.equal(getPostContentLinkPreviewUrl({ version: 2 }), null);
});
