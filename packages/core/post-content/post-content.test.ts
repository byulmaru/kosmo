import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostContentDocumentV1, postContentSchemaVersion } from './index';
import {
  arePostContentRevisionsEqual,
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentToText,
} from './server';

test('converts trimmed Plain Text and normalized line endings to hard breaks', () => {
  const body = postContentDocumentFromText('  first\r\n\rsecond\n\nlast  ');

  assert.equal(body.schemaVersion, 1);
  assert.deepEqual(body.document, {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'first' },
          { type: 'hard_break' },
          { type: 'hard_break' },
          { type: 'text', text: 'second' },
          { type: 'hard_break' },
          { type: 'hard_break' },
          { type: 'text', text: 'last' },
        ],
      },
    ],
  });
  assert.equal(postContentDocumentToText(body), 'first\n\nsecond\n\nlast');
});

test('keeps one empty paragraph for an empty document', () => {
  assert.deepEqual(postContentDocumentFromText(' \r\n ').document, {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
});

test('canonicalizes empty paragraphs, adjacent text, duplicate marks and URLs', () => {
  assert.deepEqual(
    canonicalizePostContentDocument(1, {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'linked ',
              marks: [
                { type: 'link', attrs: { href: 'HTTPS://EXAMPLE.COM:443/path' } },
                { type: 'link', attrs: { href: 'https://example.com/path' } },
              ],
            },
            {
              type: 'text',
              text: 'text',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/path' } }],
            },
          ],
        },
      ],
    }),
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'linked text',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/path' } }],
            },
          ],
        },
      ],
    },
  );
});

test('projects paragraph boundaries, hard breaks and link labels to Plain Text', () => {
  assert.equal(
    postContentDocumentToText({
      schemaVersion: 1,
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'one' },
              { type: 'hard_break' },
              {
                type: 'text',
                text: 'link',
                marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              },
            ],
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
        ],
      },
    }),
    'one\nlink\n\ntwo',
  );
});

for (const [name, document] of [
  ['pre node', { type: 'doc', content: [{ type: 'pre' }] }],
  ['unknown paragraph attr', { type: 'doc', content: [{ type: 'paragraph', attrs: {} }] }],
  [
    'unsafe link',
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'unsafe',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
  ],
  [
    'nested different links',
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'links',
              marks: [
                { type: 'link', attrs: { href: 'https://example.com/a' } },
                { type: 'link', attrs: { href: 'https://example.com/b' } },
              ],
            },
          ],
        },
      ],
    },
  ],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => canonicalizePostContentDocument(1, document));
  });
}

test('rejects unsupported schema versions', () => {
  assert.throws(
    () => canonicalizePostContentDocument(2, { type: 'doc', content: [{ type: 'paragraph' }] }),
    /Unsupported PostContent schema version/,
  );
});

test('compares canonical document and Content Warning meaning', () => {
  const first = {
    schemaVersion: postContentSchemaVersion,
    contentWarning: null,
    document: {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            { type: 'text' as const, text: 'a' },
            { type: 'text' as const, text: 'b' },
          ],
        },
      ],
    },
  };
  const second = {
    ...postContentDocumentFromText('ab'),
    contentWarning: null,
  };

  assert.equal(arePostContentRevisionsEqual(first, second), true);
  assert.equal(
    arePostContentRevisionsEqual(first, { ...second, contentWarning: 'warning' }),
    false,
  );
});

test('native-safe guard accepts only the V1 JSON contract', () => {
  assert.equal(isPostContentDocumentV1(postContentDocumentFromText('body').document), true);
  assert.equal(
    isPostContentDocumentV1({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'pre', text: 'body' }] }],
    }),
    false,
  );
});
