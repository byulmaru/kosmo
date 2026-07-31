import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostContentDocumentV1 } from './index';
import {
  arePostContentRevisionsEqual,
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
  postContentDocumentToText,
  validateLocalPostContentDocument,
} from './server';

function serializeJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

test('converts trimmed Plain Text and normalized line endings to hard breaks', () => {
  const body = postContentDocumentFromText('  first\r\n\rsecond\n\nlast  ');

  assert.equal(body.version, 1);
  assert.equal(body.summary, null);
  assert.deepEqual(body.body, {
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
  assert.deepEqual(postContentDocumentFromText(' \r\n ').body, {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
});

test('preserves ordered Media nodes and omits the default Sensitive Media attr', () => {
  const document = postContentDocumentFromTextAndMedia('body', [
    { mediaId: '019f6678-86fa-709b-984e-1520766b8447' },
    { mediaId: '019f6678-86fa-709b-984e-1520766b8448' },
  ]);

  assert.deepEqual(document.body, {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
      {
        type: 'media',
        attrs: {
          mediaId: '019f6678-86fa-709b-984e-1520766b8447',
        },
      },
      {
        type: 'media',
        attrs: { mediaId: '019f6678-86fa-709b-984e-1520766b8448' },
      },
    ],
  });
  assert.equal(postContentDocumentToText(document), 'body');
  assert.equal(isPostContentDocumentV1(document), true);
});

test('canonicalizes legacy Media Alt Text attrs away', () => {
  assert.deepEqual(
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          { type: 'paragraph' },
          {
            type: 'media',
            attrs: {
              altText: '이전 문서의 대체 텍스트',
              mediaId: '019f6678-86fa-709b-984e-1520766b8447',
            },
          },
        ],
      },
    }),
    postContentDocumentFromTextAndMedia('', [{ mediaId: '019f6678-86fa-709b-984e-1520766b8447' }]),
  );
});

test('canonicalizes media-only content with one empty paragraph and Sensitive Media', () => {
  const document = postContentDocumentFromTextAndMedia(
    '',
    [{ mediaId: '019f6678-86fa-709b-984e-1520766b8447' }],
    true,
  );

  assert.deepEqual(document.body, {
    type: 'doc',
    attrs: { sensitiveMedia: true },
    content: [
      { type: 'paragraph' },
      {
        type: 'media',
        attrs: { mediaId: '019f6678-86fa-709b-984e-1520766b8447' },
      },
    ],
  });
  assert.equal(postContentDocumentToText(document), '');
});

test('rejects more than four Media nodes and unknown Media or document attrs', () => {
  assert.throws(
    () =>
      postContentDocumentFromTextAndMedia(
        'body',
        Array.from({ length: 5 }, (_, index) => ({
          mediaId: `019f6678-86fa-709b-984e-1520766b844${index}`,
        })),
      ),
    /more than 4 Media nodes/,
  );
  assert.throws(() =>
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        attrs: { sensitiveMedia: true, unknown: true },
        content: [{ type: 'paragraph' }],
      },
    }),
  );
  assert.throws(() =>
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [{ type: 'media', attrs: { mediaId: 'media', unknown: true } }],
      },
    }),
  );
});

test('rejects invalid Sensitive Media and Media attr scalar types', () => {
  for (const body of [
    {
      type: 'doc',
      attrs: { sensitiveMedia: 'yes' },
      content: [{ type: 'paragraph' }],
    },
    {
      type: 'doc',
      content: [{ type: 'media', attrs: { mediaId: 123 } }],
    },
    {
      type: 'doc',
      content: [{ type: 'media', attrs: { mediaId: '' } }],
    },
    {
      type: 'doc',
      content: [{ type: 'media', attrs: { altText: 123, mediaId: 'media' } }],
    },
  ]) {
    assert.throws(() => canonicalizePostContentDocument({ version: 1, summary: null, body }));
  }
});

test('canonicalizes empty paragraphs, adjacent text, duplicate marks and URLs', () => {
  assert.deepEqual(
    serializeJson(
      canonicalizePostContentDocument({
        version: 1,
        summary: null,
        body: {
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
        },
      }),
    ),
    {
      version: 1,
      summary: null,
      body: {
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
    },
  );
});

test('canonicalizes line endings inside document text nodes to hard breaks', () => {
  assert.deepEqual(
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a\r\nb\rc\nd' }] }],
      },
    }),
    postContentDocumentFromText('a\nb\nc\nd'),
  );
});

test('projects paragraph boundaries, hard breaks and link labels to Plain Text', () => {
  assert.equal(
    postContentDocumentToText({
      version: 1,
      summary: null,
      body: {
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
  ['invalid content expression', { type: 'doc', content: [{ type: 'text', text: 'body' }] }],
  ['unknown paragraph attr', { type: 'doc', content: [{ type: 'paragraph', attrs: {} }] }],
  ['null paragraph content', { type: 'doc', content: [{ type: 'paragraph', content: null }] }],
  [
    'null text marks',
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body', marks: null }] }],
    },
  ],
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
    assert.throws(() =>
      canonicalizePostContentDocument({ version: 1, summary: null, body: document }),
    );
  });
}

test('rejects unsupported schema versions', () => {
  assert.throws(
    () =>
      canonicalizePostContentDocument({
        version: 2,
        summary: null,
        body: { type: 'doc', content: [{ type: 'paragraph' }] },
      }),
    /Unsupported PostContent schema version/,
  );
});

test('compares canonical body and summary meaning', () => {
  const first = {
    version: 1,
    summary: null,
    body: {
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
  const second = postContentDocumentFromText('ab');

  assert.equal(arePostContentRevisionsEqual(first, second), true);
  assert.equal(arePostContentRevisionsEqual(first, { ...second, summary: 'warning' }), false);
});

test('native-safe guard accepts additive V1 properties while validating consumed values', () => {
  assert.equal(isPostContentDocumentV1(postContentDocumentFromText('body')), true);
  assert.equal(
    isPostContentDocumentV1({
      version: 1,
      summary: null,
      ignoredDocumentProperty: true,
      body: {
        type: 'doc',
        ignoredBodyProperty: true,
        attrs: { sensitiveMedia: true, ignoredBodyAttr: true },
        content: [
          {
            type: 'paragraph',
            ignoredParagraphProperty: true,
            content: [
              {
                type: 'text',
                text: '링크',
                ignoredTextProperty: true,
                marks: [
                  {
                    type: 'link',
                    ignoredMarkProperty: true,
                    attrs: {
                      href: 'https://example.com/',
                      ignoredLinkAttr: true,
                    },
                  },
                ],
              },
              { type: 'hard_break', ignoredHardBreakProperty: true },
            ],
          },
          {
            type: 'media',
            ignoredMediaProperty: true,
            attrs: {
              mediaId: '019f6678-86fa-709b-984e-1520766b8447',
              altText: '이전 초안 속성',
            },
          },
        ],
      },
    }),
    true,
  );
  assert.equal(
    isPostContentDocumentV1({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'pre', text: 'body' }] }],
      },
    }),
    false,
  );
});

test('normalizes summary as authored revision content', () => {
  const document = postContentDocumentFromText('body', '  warning\r\ntext  ');

  assert.equal(document.summary, 'warning\ntext');
  assert.equal(
    arePostContentRevisionsEqual(document, { ...document, summary: 'different warning' }),
    false,
  );
  assert.throws(() => postContentDocumentFromText('body', ' \n '), /must not be empty/);
});

test('validates the combined local summary and body length', () => {
  assert.doesNotThrow(() =>
    validateLocalPostContentDocument(postContentDocumentFromText('가'.repeat(499), '나')),
  );
  assert.throws(
    () => validateLocalPostContentDocument(postContentDocumentFromText('가'.repeat(500), '나')),
    /exceeds 500 characters/,
  );
  assert.throws(
    () => validateLocalPostContentDocument(postContentDocumentFromText('')),
    /body text or Media/,
  );
  assert.throws(
    () => validateLocalPostContentDocument(postContentDocumentFromText('', 'warning')),
    /body text or Media/,
  );
  assert.doesNotThrow(() =>
    validateLocalPostContentDocument(
      postContentDocumentFromTextAndMedia('', [
        { mediaId: '019f6678-86fa-709b-984e-1520766b8447' },
      ]),
    ),
  );
});
