import assert from 'node:assert/strict';
import test from 'node:test';
import { isPostContentDocumentV1 } from './index';
import {
  arePostContentRevisionsEqual,
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
  postContentDocumentToHtml,
  postContentDocumentToText,
  validateLocalPostContentDocument,
} from './server';

const aliceProfileId = '019f6678-86fa-709b-984e-1520766b8441';
const otherProfileId = '019f6678-86fa-709b-984e-1520766b8442';

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

test('auto-links explicit HTTP URLs and leaves delimiters and terminal punctuation as text', () => {
  const bodyText =
    '(HTTPS://EXAMPLE.COM:443/a/../path?one=1&two=2), "<https://example.org/quoted?q=1&x=2>"\r\n' +
    'http://example.net/a_(b).';
  const document = postContentDocumentFromText(bodyText);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: '(' },
      {
        type: 'text',
        text: 'HTTPS://EXAMPLE.COM:443/a/../path?one=1&two=2',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/path?one=1&two=2' } }],
      },
      { type: 'text', text: '), "<' },
      {
        type: 'text',
        text: 'https://example.org/quoted?q=1&x=2',
        marks: [{ type: 'link', attrs: { href: 'https://example.org/quoted?q=1&x=2' } }],
      },
      { type: 'text', text: '>"' },
      { type: 'hard_break' },
      {
        type: 'text',
        text: 'http://example.net/a_(b)',
        marks: [{ type: 'link', attrs: { href: 'http://example.net/a_(b)' } }],
      },
      { type: 'text', text: '.' },
    ],
  });
  assert.equal(postContentDocumentToText(document), bodyText.replaceAll('\r\n', '\n'));
  assert.equal(
    postContentDocumentToHtml(document),
    '<p>(<a href="https://example.com/path?one=1&amp;two=2">HTTPS://EXAMPLE.COM:443/a/../path?one=1&amp;two=2</a>), "&lt;<a href="https://example.org/quoted?q=1&amp;x=2">https://example.org/quoted?q=1&amp;x=2</a>&gt;"<br><a href="http://example.net/a_(b)">http://example.net/a_(b)</a>.</p>',
  );
});

test('trims punctuation before unmatched closing wrappers and keeps wrappers as text', () => {
  for (const [bodyText, expectedHtml] of [
    [
      '(https://example.com/path.)',
      '<p>(<a href="https://example.com/path">https://example.com/path</a>.)</p>',
    ],
    [
      '[https://example.com/path.]',
      '<p>[<a href="https://example.com/path">https://example.com/path</a>.]</p>',
    ],
    [
      '{https://example.com/path.}',
      '<p>{<a href="https://example.com/path">https://example.com/path</a>.}</p>',
    ],
  ]) {
    assert.equal(postContentDocumentToHtml(postContentDocumentFromText(bodyText)), expectedHtml);
  }
});

test('keeps embedded, unsupported, and invalid URLs as plain text', () => {
  const bodyText = 'foohttps://example.com ftp://example.com javascript:alert(1) http://[bad';
  const document = postContentDocumentFromText(bodyText);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [{ type: 'text', text: bodyText }],
  });
  assert.equal(postContentDocumentToHtml(document), `<p>${bodyText}</p>`);
});

test('does not link URL fragments split by a Mention and preserves media metadata', () => {
  const bodyText = 'https://example.com/@alice?x=1 then https://example.org/path';
  const mentionStart = bodyText.indexOf('@alice');
  const mediaId = '019f6678-86fa-709b-984e-1520766b8447';
  const document = postContentDocumentFromTextAndMedia(bodyText, [{ mediaId }], true, 'warning', [
    {
      end: mentionStart + '@alice'.length,
      profileId: aliceProfileId,
      relativeHandle: '@alice',
      start: mentionStart,
    },
  ]);

  assert.deepEqual(document, {
    version: 1,
    summary: 'warning',
    body: {
      type: 'doc',
      attrs: { sensitiveMedia: true },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'https://example.com/' },
            { type: 'mention', attrs: { profileId: aliceProfileId } },
            { type: 'text', text: '?x=1 then ' },
            {
              type: 'text',
              text: 'https://example.org/path',
              marks: [{ type: 'link', attrs: { href: 'https://example.org/path' } }],
            },
          ],
        },
        { type: 'media', attrs: { mediaId } },
      ],
    },
  });
  assert.equal(
    postContentDocumentToHtml(document),
    '<p>https://example.com/<span>@알 수 없는 사용자</span>?x=1 then <a href="https://example.org/path">https://example.org/path</a></p>',
  );
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

test('creates canonical Mention nodes from exact UTF-16 authored-body ranges', () => {
  const bodyText = '🙂 hi @alice@remote.example and @alice@remote.example';
  const handle = '@alice@remote.example';
  const firstStart = bodyText.indexOf(handle);
  const secondStart = bodyText.lastIndexOf(handle);
  const document = postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
    {
      end: firstStart + handle.length,
      profileId: aliceProfileId,
      relativeHandle: handle,
      start: firstStart,
    },
    {
      end: secondStart + handle.length,
      profileId: aliceProfileId,
      relativeHandle: handle,
      start: secondStart,
    },
  ]);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: '🙂 hi ' },
      { type: 'mention', attrs: { profileId: aliceProfileId } },
      { type: 'text', text: ' and ' },
      { type: 'mention', attrs: { profileId: aliceProfileId } },
    ],
  });
});

test('rejects invalid authored Mention ranges', () => {
  const bodyText = '🙂 @alice@remote.example';
  const handle = '@alice@remote.example';
  const start = bodyText.indexOf(handle);
  const valid = {
    end: start + handle.length,
    profileId: aliceProfileId,
    relativeHandle: handle,
    start,
  };

  for (const mention of [
    { ...valid, start: start + 0.5 },
    { ...valid, start: 1, end: 2 }, // splits the emoji's surrogate pair
    { ...valid, start: start + 1 },
    { ...valid, end: bodyText.length + 1 },
    { ...valid, end: valid.end - 1 },
  ]) {
    assert.throws(
      () => postContentDocumentFromTextAndMedia(bodyText, [], false, null, [mention]),
      /Mention selection is invalid/,
    );
  }

  assert.throws(
    () =>
      postContentDocumentFromTextAndMedia('x @alice@remote.example', [], false, null, [
        { ...valid, start: 2, end: 2 + handle.length },
        { ...valid, start: 3, end: 3 + handle.length },
      ]),
    /Mention selection is invalid/,
  );
});

test('rejects selected handles embedded in a larger handle token', () => {
  for (const [bodyText, relativeHandle] of [
    ['word@alice', '@alice'],
    ['@alicex', '@alice'],
    ['@alice.x', '@alice'],
    ['@alice@remote.example-more', '@alice@remote.example'],
    ['@alice@remote.example.extra', '@alice@remote.example'],
    ['@alice@remote.example:3000', '@alice@remote.example'],
  ]) {
    const start = bodyText.indexOf(relativeHandle);
    assert.throws(
      () =>
        postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
          {
            end: start + relativeHandle.length,
            profileId: aliceProfileId,
            relativeHandle,
            start,
          },
        ]),
      /Mention selection is invalid/,
    );
  }

  assert.doesNotThrow(() =>
    postContentDocumentFromTextAndMedia('@alice@remote.example. next', [], false, null, [
      {
        end: '@alice@remote.example'.length,
        profileId: aliceProfileId,
        relativeHandle: '@alice@remote.example',
        start: 0,
      },
    ]),
  );
  assert.doesNotThrow(() =>
    postContentDocumentFromTextAndMedia('@alice. next', [], false, null, [
      { end: '@alice'.length, profileId: aliceProfileId, relativeHandle: '@alice', start: 0 },
    ]),
  );
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

test('checks complete Unicode code points at Mention token boundaries', () => {
  const relativeHandle = '@aa';
  for (const bodyText of ['𐐀@aa', '@aa𐐀']) {
    const start = bodyText.indexOf(relativeHandle);
    assert.throws(
      () =>
        postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
          {
            end: start + relativeHandle.length,
            profileId: aliceProfileId,
            relativeHandle,
            start,
          },
        ]),
      /Mention selection is invalid/,
    );
  }

  const bodyText = `😀${relativeHandle}😀`;
  const start = bodyText.indexOf(relativeHandle);
  assert.doesNotThrow(() =>
    postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
      {
        end: start + relativeHandle.length,
        profileId: aliceProfileId,
        relativeHandle,
        start,
      },
    ]),
  );
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

test('canonicalizes Mention identities and uses the unavailable Profile fallback in text', () => {
  const first = canonicalizePostContentDocument({
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            {
              type: 'mention',
              attrs: { profileId: aliceProfileId },
            },
          ],
        },
      ],
    },
  });
  const formattingEquivalent = {
    ...first,
    body: {
      ...first.body,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            { type: 'text' as const, text: 'Hello ' },
            {
              type: 'mention' as const,
              attrs: { profileId: aliceProfileId },
            },
          ],
        },
      ],
    },
  };

  assert.equal(postContentDocumentToText(first), 'Hello @알 수 없는 사용자');
  assert.equal(arePostContentRevisionsEqual(first, formattingEquivalent), true);
  assert.equal(
    arePostContentRevisionsEqual(first, {
      ...first,
      body: {
        ...first.body,
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              {
                type: 'mention',
                attrs: { profileId: otherProfileId },
              },
            ],
          },
        ],
      },
    }),
    false,
  );

  assert.deepEqual(
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'mention',
                attrs: { label: '@legacy', profileId: aliceProfileId },
              },
            ],
          },
        ],
      },
    }),
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { profileId: aliceProfileId } }],
          },
        ],
      },
    }),
  );
});

test('rejects Mention attrs without a valid Profile identity or with a malformed legacy label', () => {
  for (const attrs of [{ profileId: 'not-a-uuid' }, { label: 123, profileId: aliceProfileId }]) {
    assert.throws(() =>
      canonicalizePostContentDocument({
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'mention', attrs }] }],
        },
      }),
    );
  }
});

test('native-safe guard accepts additive V1 properties while validating consumed values', () => {
  assert.equal(isPostContentDocumentV1(postContentDocumentFromText('body')), true);
  assert.equal(
    isPostContentDocumentV1({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        attrs: { futureFlag: true },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
      },
    }),
    true,
  );
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

test('native-safe guard accepts projected Profile global IDs while canonicalization keeps UUID input strict', () => {
  const projectedDocument = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'mention',
              attrs: { profileId: 'UHJvZmlsZS0x' },
            },
          ],
        },
      ],
    },
  } as const;

  assert.equal(isPostContentDocumentV1(projectedDocument), true);
  assert.throws(
    () => canonicalizePostContentDocument(projectedDocument),
    /Mention Profile ID must be a UUID/,
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

test('requires authored body text and counts its actual length for local Mention nodes', () => {
  const relativeHandle = '@aa';
  const bodyText = `${'가'.repeat(496)} ${relativeHandle}`;
  const start = bodyText.length - relativeHandle.length;
  const document = postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
    {
      end: bodyText.length,
      profileId: aliceProfileId,
      relativeHandle,
      start,
    },
  ]);

  assert.deepEqual(validateLocalPostContentDocument(document, bodyText), document);
  assert.throws(() => validateLocalPostContentDocument(document), /require the authored body text/);
  assert.doesNotThrow(() =>
    validateLocalPostContentDocument(postContentDocumentFromText('plain'), 'plain'),
  );
  assert.throws(
    () => validateLocalPostContentDocument(postContentDocumentFromText('plain'), 'different'),
    /must match its document/,
  );
  assert.throws(
    () => validateLocalPostContentDocument(document, '가'.repeat(501)),
    /exceeds 500 characters/,
  );
  assert.equal(postContentDocumentToText(document).length > bodyText.length, true);
});

test('rejects local Mention nodes when authored body text is missing', () => {
  assert.throws(
    () =>
      validateLocalPostContentDocument({
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'mention',
                  attrs: { profileId: aliceProfileId },
                },
              ],
            },
          ],
        },
      }),
    /require the authored body text/,
  );
});
