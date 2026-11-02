import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRemoteNoteContent } from '../activitypub-note-content';
import { isPostContentDocumentV1, readPostContentDocumentV1 } from './index';
import {
  applyPostContentHashtags,
  applyRemotePostContentHashtags,
  arePostContentRevisionsEqual,
  canonicalizePostContentDocument,
  findLocalPostContentHashtagCandidates,
  findRemotePostContentHashtags,
  postContentDocumentFromText,
  postContentDocumentFromTextAndMedia,
  postContentDocumentToHtml,
  postContentDocumentToText,
  postContentHashtagCandidatesFromText,
  validateLocalPostContentDocument,
} from './server';
import type { PostContentDocumentV1 } from './index';

const aliceProfileId = '019f6678-86fa-709b-984e-1520766b8441';
const otherProfileId = '019f6678-86fa-709b-984e-1520766b8442';
const hashtagId = '019f6678-86fa-709b-984e-1520766b8443';
const otherHashtagId = '019f6678-86fa-709b-984e-1520766b8444';

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

test('preserves repeated Hashtag identities and exact authored tokens in text projection', () => {
  const longToken = `#${'名'.repeat(65)}`;
  const document = canonicalizePostContentDocument({
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Tags: ' },
            { type: 'hashtag', attrs: { hashtagId, token: '#MiXeD' } },
            { type: 'text', text: ' / ' },
            { type: 'hashtag', attrs: { hashtagId, token: '#mixed' } },
            { type: 'text', text: ' / ' },
            { type: 'hashtag', attrs: { hashtagId, token: longToken } },
          ],
        },
      ],
    },
  });

  assert.equal(isPostContentDocumentV1(document), true);
  assert.equal(postContentDocumentToText(document), `Tags: #MiXeD / #mixed / ${longToken}`);
  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Tags: ' },
      { type: 'hashtag', attrs: { hashtagId, token: '#MiXeD' } },
      { type: 'text', text: ' / ' },
      { type: 'hashtag', attrs: { hashtagId, token: '#mixed' } },
      { type: 'text', text: ' / ' },
      { type: 'hashtag', attrs: { hashtagId, token: longToken } },
    ],
  });
});

test('validates persisted Hashtag identity and token while accepting projected IDs in the app guard', () => {
  for (const attrs of [
    { hashtagId: 'not-a-uuid', token: '#tag' },
    { hashtagId, token: '' },
  ]) {
    assert.throws(() =>
      canonicalizePostContentDocument({
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'hashtag', attrs }] }],
        },
      }),
    );
  }
  assert.throws(() =>
    canonicalizePostContentDocument({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [{ type: 'hashtag', attrs: { hashtagId, token: '#tag' } }],
      },
    }),
  );

  const projectedDocument = {
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'hashtag', attrs: { hashtagId: 'SGFzaHRhZy0x', token: '#tag' } }],
        },
      ],
    },
  } as const;

  assert.equal(isPostContentDocumentV1(projectedDocument), true);
  assert.throws(
    () => canonicalizePostContentDocument(projectedDocument),
    /Hashtag ID must be a UUID/u,
  );
});

test('auto-links explicit HTTP URLs with canonical hrefs and original text', () => {
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

test('keeps linkify-it punctuation inside the matched URL before a closing wrapper', () => {
  const bodyText = '(https://example.com/path.)';
  const document = postContentDocumentFromText(bodyText);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: '(' },
      {
        type: 'text',
        text: 'https://example.com/path.',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/path.' } }],
      },
      { type: 'text', text: ')' },
    ],
  });
  assert.equal(postContentDocumentToText(document), bodyText);
});

test('keeps embedded, unsupported, fuzzy, and invalid URLs as plain text', () => {
  const bodyText =
    'foohttps://example.com www.example.com example.org user@example.com mailto:user@example.com ftp://example.com //example.com javascript:alert(1) http://[bad';
  const document = postContentDocumentFromText(bodyText);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [{ type: 'text', text: bodyText }],
  });
  assert.equal(postContentDocumentToHtml(document), `<p>${bodyText}</p>`);
});

test('finds normalized local hashtag candidates without URL or mention occurrences', () => {
  const bodyText =
    `https://example.com/path/#path?query=#query&fragment=1#fragment #ok (#wrapped) abc#embedded ` +
    '#Ｆｏｏ #Cafe\u0301 #１２３ #Ⓐ 😀#astral';

  const candidates = postContentHashtagCandidatesFromText(bodyText);

  assert.deepEqual(
    candidates.map(({ start, end }) => bodyText.slice(start, end)),
    ['#ok', '#wrapped', '#Ｆｏｏ', '#Cafe\u0301', '#１２３', '#Ⓐ', '#astral'],
  );
});

test('applies local hashtag candidates while preserving unrelated document structure and marks', () => {
  const document: PostContentDocumentV1 = {
    version: 1,
    summary: 'warning',
    body: {
      type: 'doc',
      attrs: { sensitiveMedia: false },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'prefix' },
            { type: 'mention', attrs: { handle: '@alice', profileId: aliceProfileId } },
            { type: 'text', text: '#mention-adjacent #before' },
            { type: 'hashtag', attrs: { hashtagId, token: '#old' } },
            { type: 'text', text: '#hashtag-adjacent #Ｆoo and ' },
            {
              type: 'text',
              text: 'https://example.com/path/#linked',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/path/#linked' } }],
            },
            { type: 'text', text: ' and ' },
            {
              type: 'text',
              text: '#linked-label',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/label' } }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'second #Tag' }] },
        { type: 'media', attrs: { mediaId: otherProfileId } },
      ],
    },
  };
  const candidates = findLocalPostContentHashtagCandidates(document);
  assert.deepEqual(
    candidates.map(({ paragraphIndex, token }) => ({ paragraphIndex, token })),
    [
      { paragraphIndex: 0, token: '#before' },
      { paragraphIndex: 0, token: '#Ｆoo' },
      { paragraphIndex: 1, token: '#Tag' },
    ],
  );

  const enriched = applyPostContentHashtags(
    document,
    candidates.map((candidate) => ({ ...candidate, hashtagId: otherHashtagId })),
  );

  assert.equal(enriched.summary, 'warning');
  assert.deepEqual(enriched.body.attrs, { sensitiveMedia: false });
  assert.deepEqual(enriched.body.content.at(-1), document.body.content.at(-1));
  assert.equal(postContentDocumentToText(enriched), postContentDocumentToText(document));
  const paragraphs = enriched.body.content.filter((block) => block.type === 'paragraph');
  assert.deepEqual(
    paragraphs.flatMap((paragraph) =>
      paragraph.type === 'paragraph'
        ? (paragraph.content ?? []).flatMap((node) =>
            node.type === 'hashtag'
              ? [{ hashtagId: node.attrs.hashtagId, token: node.attrs.token }]
              : [],
          )
        : [],
    ),
    [
      { hashtagId: otherHashtagId, token: '#before' },
      { hashtagId, token: '#old' },
      { hashtagId: otherHashtagId, token: '#Ｆoo' },
      { hashtagId: otherHashtagId, token: '#Tag' },
    ],
  );
  const linkedText = paragraphs
    .flatMap((paragraph) => (paragraph.type === 'paragraph' ? (paragraph.content ?? []) : []))
    .find((node) => node.type === 'text' && node.text.startsWith('https://'));
  assert.deepEqual(linkedText?.type === 'text' ? linkedText.marks : undefined, [
    { type: 'link', attrs: { href: 'https://example.com/path/#linked' } },
  ]);
  assert.equal(applyPostContentHashtags(document, []), document);
});

test('keeps 64-codepoint hashtags and preserves longer tokens as Plain Text', () => {
  const acceptedToken = '#' + '𐐀'.repeat(64);
  const longerToken = '#' + '𐐀'.repeat(65);
  const bodyText = acceptedToken + ' ' + longerToken;
  const candidates = postContentHashtagCandidatesFromText(bodyText);

  assert.deepEqual(
    candidates.map(({ start, end }) => bodyText.slice(start, end)),
    [acceptedToken],
  );

  const document = postContentDocumentFromTextAndMedia(
    bodyText,
    [],
    false,
    null,
    [],
    candidates.map((candidate) => ({ ...candidate, hashtagId })),
  );

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'hashtag', attrs: { hashtagId, token: acceptedToken } },
      { type: 'text', text: ' ' + longerToken },
    ],
  });
  assert.equal(postContentDocumentToText(document), bodyText);
});

test('matches typed remote Hashtags across projected linked markup and preserves body tokens', () => {
  const longToken = `#${'名'.repeat(65)}`;
  const document = projectRemoteNoteContent({
    content:
      '<p>Topic <a href="https://remote.example/tags/mixed"><span>#Ｍｉ</span><strong>XeD</strong></a> / ' +
      '<a href="https://remote.example/tags/mixed">#mixed</a></p>' +
      `<p>More ${longToken} and #remote-tag🔥 and #two words</p>`,
    mediaType: 'text/html',
    summary: null,
  });
  const matches = findRemotePostContentHashtags(document, [
    '#Mixed',
    longToken,
    '#remote-tag🔥',
    '#two words',
  ]);
  assert.equal(applyRemotePostContentHashtags(document, []), document);

  assert.deepEqual(matches, [
    { name: '#Mixed', paragraphIndex: 0, start: 6, end: 12, token: '#ＭｉXeD' },
    { name: '#Mixed', paragraphIndex: 0, start: 15, end: 21, token: '#mixed' },
    { name: longToken, paragraphIndex: 1, start: 5, end: 71, token: longToken },
    { name: '#remote-tag🔥', paragraphIndex: 1, start: 76, end: 89, token: '#remote-tag🔥' },
    { name: '#two words', paragraphIndex: 1, start: 94, end: 104, token: '#two words' },
  ]);

  const tagged = applyRemotePostContentHashtags(
    document,
    matches.map((match) => ({
      ...match,
      hashtagId: match.name === '#Mixed' ? hashtagId : otherHashtagId,
    })),
  );

  assert.equal(postContentDocumentToText(tagged), postContentDocumentToText(document));
  assert.deepEqual(
    tagged.body.content.map((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).flatMap((node) =>
            node.type === 'hashtag'
              ? [{ hashtagId: node.attrs.hashtagId, token: node.attrs.token }]
              : [],
          )
        : [],
    ),
    [
      [
        { hashtagId, token: '#ＭｉXeD' },
        { hashtagId, token: '#mixed' },
      ],
      [
        { hashtagId: otherHashtagId, token: longToken },
        { hashtagId: otherHashtagId, token: '#remote-tag🔥' },
        { hashtagId: otherHashtagId, token: '#two words' },
      ],
    ],
  );
});

test('matches only complete typed remote Hashtags and never crosses body boundaries', () => {
  const document = canonicalizePostContentDocument({
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '#TagExtra abc#tag ' },
            {
              type: 'text',
              text: 'https://example.com/#tag',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/#tag' } }],
            },
            { type: 'text', text: ' #BodyOnly' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '#ta' },
            { type: 'hard_break' },
            { type: 'text', text: 'g' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '#ta' },
            { type: 'mention', attrs: { profileId: aliceProfileId } },
            { type: 'text', text: 'g' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '#ta' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'g' }] },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'begin #Ta',
              marks: [{ type: 'link', attrs: { href: 'https://remote.example/tags/first' } }],
            },
            {
              type: 'text',
              text: 'gExtra finish',
              marks: [{ type: 'link', attrs: { href: 'https://remote.example/tags/second' } }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '#tag' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '#οσ #ος' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '#one #two' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '# tag' }] },
      ],
    },
  });
  const sigmaMatches = findRemotePostContentHashtags(document, ['#οσ', '#ος']);
  assert.deepEqual(sigmaMatches, [
    { name: '#οσ', paragraphIndex: 7, start: 0, end: 3, token: '#οσ' },
    { name: '#ος', paragraphIndex: 7, start: 4, end: 7, token: '#ος' },
  ]);
  assert.deepEqual(findRemotePostContentHashtags(document, ['#ος', '#οσ']), sigmaMatches);
  const matches = findRemotePostContentHashtags(document, [
    '#TAG',
    '#tagExtra',
    '#ος',
    '#οσ',
    '#two',
    '#one #two',
    '# tag',
  ]);

  assert.deepEqual(matches, [
    { name: '#tagExtra', paragraphIndex: 0, start: 0, end: 9, token: '#TagExtra' },
    { name: '#tagExtra', paragraphIndex: 5, start: 6, end: 15, token: '#TagExtra' },
    { name: '#TAG', paragraphIndex: 6, start: 0, end: 4, token: '#tag' },
    ...sigmaMatches,
    { name: '#one #two', paragraphIndex: 8, start: 0, end: 9, token: '#one #two' },
    { name: '# tag', paragraphIndex: 9, start: 0, end: 5, token: '# tag' },
  ]);

  const tagged = applyRemotePostContentHashtags(
    document,
    matches.map((match) => ({
      ...match,
      hashtagId:
        match.name === '#TAG' || match.name === '#οσ' || match.name === '# tag'
          ? hashtagId
          : otherHashtagId,
    })),
  );

  assert.equal(postContentDocumentToText(tagged), postContentDocumentToText(document));
  const firstParagraph = tagged.body.content[0];
  assert.ok(firstParagraph?.type === 'paragraph');
  assert.deepEqual(firstParagraph.content?.[0], {
    type: 'hashtag',
    attrs: { hashtagId: otherHashtagId, token: '#TagExtra' },
  });
  assert.deepEqual(firstParagraph.content?.[2], {
    type: 'text',
    text: 'https://example.com/#tag',
    marks: [{ type: 'link', attrs: { href: 'https://example.com/#tag' } }],
  });
  assert.equal(
    tagged.body.content.flatMap((block) =>
      block.type === 'paragraph'
        ? (block.content ?? []).filter((node) => node.type === 'hashtag')
        : [],
    ).length,
    7,
  );
  assert.deepEqual(
    tagged.body.content
      .slice(7)
      .map((block) =>
        block.type === 'paragraph'
          ? (block.content ?? []).filter((node) => node.type === 'hashtag')
          : [],
      ),
    [
      [
        { type: 'hashtag', attrs: { hashtagId, token: '#οσ' } },
        { type: 'hashtag', attrs: { hashtagId: otherHashtagId, token: '#ος' } },
      ],
      [{ type: 'hashtag', attrs: { hashtagId: otherHashtagId, token: '#one #two' } }],
      [{ type: 'hashtag', attrs: { hashtagId, token: '# tag' } }],
    ],
  );
});

test('excludes hashtag fragments from FTP, mailto, protocol-relative, and HTTPS URLs', () => {
  const bodyText =
    'ftp://example.com/path/#ftp mailto:user@example.com?subject=#mail ' +
    '//example.com/path/#relative https://example.com/path/#https then #outside';

  const candidates = postContentHashtagCandidatesFromText(bodyText);

  assert.deepEqual(
    candidates.map(({ start, end }) => bodyText.slice(start, end)),
    ['#outside'],
  );
});

test('excludes fragments from hierarchical URLs and keeps an adjacent hashtag', () => {
  const bodyText =
    'file:///tmp/#inside ipfs://example.test/path/#inside file:///tmp/a_(b)/#inside ' +
    '(file:///tmp/#inside).#outside';
  const candidates = postContentHashtagCandidatesFromText(bodyText);

  assert.deepEqual(
    candidates.map(({ start, end }) => bodyText.slice(start, end)),
    ['#outside'],
  );

  const document = postContentDocumentFromTextAndMedia(
    bodyText,
    [],
    false,
    null,
    [],
    candidates.map((candidate) => ({ ...candidate, hashtagId })),
  );
  const hashtagNodes = document.body.content.flatMap((block) =>
    block.type === 'paragraph'
      ? (block.content ?? []).filter((node) => node.type === 'hashtag')
      : [],
  );

  assert.deepEqual(
    hashtagNodes.map(({ attrs }) => attrs.token),
    ['#outside'],
  );
  assert.equal(postContentDocumentToText(document), bodyText);
});

test('builds hashtag and Mention nodes from normalized-text offsets', () => {
  const bodyText = 'before\r\n @alice then #Mixed123';
  const normalizedBodyText = bodyText.replaceAll('\r\n', '\n').trim();
  const relativeHandle = '@alice';
  const mentionStart = normalizedBodyText.indexOf(relativeHandle);
  const mentions = [
    {
      end: mentionStart + relativeHandle.length,
      handle: relativeHandle,
      profileId: aliceProfileId,
      relativeHandle,
      start: mentionStart,
    },
  ];
  const candidates = postContentHashtagCandidatesFromText(normalizedBodyText, mentions);

  const document = postContentDocumentFromTextAndMedia(
    normalizedBodyText,
    [],
    false,
    null,
    mentions,
    candidates.map((candidate) => ({ ...candidate, hashtagId })),
  );

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'before' },
      { type: 'hard_break' },
      { type: 'text', text: ' ' },
      { type: 'mention', attrs: { handle: relativeHandle, profileId: aliceProfileId } },
      { type: 'text', text: ' then ' },
      { type: 'hashtag', attrs: { hashtagId, token: '#Mixed123' } },
    ],
  });
  assert.equal(postContentDocumentToText(document), normalizedBodyText);
});

test('does not link URL fragments split by a Mention and preserves media metadata', () => {
  const bodyText = 'https://example.com/@alice?x=1 then https://example.org/path';
  const mentionStart = bodyText.indexOf('@alice');
  const mediaId = '019f6678-86fa-709b-984e-1520766b8447';
  const document = postContentDocumentFromTextAndMedia(bodyText, [{ mediaId }], true, 'warning', [
    {
      end: mentionStart + '@alice'.length,
      handle: '@alice',
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
            { type: 'mention', attrs: { handle: '@alice', profileId: aliceProfileId } },
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
    '<p>https://example.com/<span>@alice</span>?x=1 then <a href="https://example.org/path">https://example.org/path</a></p>',
  );
  assert.equal(
    postContentDocumentToText(document),
    'https://example.com/@alice?x=1 then https://example.org/path',
  );
  assert.equal(
    postContentDocumentToText(document, new Map([[aliceProfileId, '@alice@example.com']])),
    'https://example.com/@alice@example.com?x=1 then https://example.org/path',
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
  const authoredHandle = '@ALICE@REMOTE.EXAMPLE';
  const handle = '@alice@remote.example';
  const bodyText = `🙂 hi ${authoredHandle} and ${authoredHandle}`;
  const firstStart = bodyText.indexOf(authoredHandle);
  const secondStart = bodyText.lastIndexOf(authoredHandle);
  const document = postContentDocumentFromTextAndMedia(bodyText, [], false, null, [
    {
      end: firstStart + authoredHandle.length,
      handle,
      profileId: aliceProfileId,
      relativeHandle: authoredHandle,
      start: firstStart,
    },
    {
      end: secondStart + authoredHandle.length,
      handle,
      profileId: aliceProfileId,
      relativeHandle: authoredHandle,
      start: secondStart,
    },
  ]);

  assert.deepEqual(document.body.content[0], {
    type: 'paragraph',
    content: [
      { type: 'text', text: '🙂 hi ' },
      { type: 'mention', attrs: { handle, profileId: aliceProfileId } },
      { type: 'text', text: ' and ' },
      { type: 'mention', attrs: { handle, profileId: aliceProfileId } },
    ],
  });
  assert.equal(postContentDocumentToText(document), `🙂 hi ${handle} and ${handle}`);
  assert.equal(
    postContentDocumentToText(document, new Map([[aliceProfileId, '@renamed@example.com']])),
    '🙂 hi @renamed@example.com and @renamed@example.com',
  );
  assert.equal(
    postContentDocumentToHtml(document),
    '<p>🙂 hi <span>@alice@remote.example</span> and <span>@alice@remote.example</span></p>',
  );
  assert.equal(
    postContentDocumentToHtml(
      document,
      new Map([
        [aliceProfileId, { href: 'https://remote.example/@alice', label: '@renamed@example.com' }],
      ]),
    ),
    '<p>🙂 hi <span class="h-card"><a href="https://remote.example/@alice" class="u-url mention">@renamed@example.com</a></span> and ' +
      '<span class="h-card"><a href="https://remote.example/@alice" class="u-url mention">@renamed@example.com</a></span></p>',
  );
});

test('rejects invalid authored Mention ranges', () => {
  const bodyText = '🙂 @alice@remote.example';
  const handle = '@alice@remote.example';
  const start = bodyText.indexOf(handle);
  const valid = {
    end: start + handle.length,
    handle,
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
            handle: relativeHandle,
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
        handle: '@alice@remote.example',
        profileId: aliceProfileId,
        relativeHandle: '@alice@remote.example',
        start: 0,
      },
    ]),
  );
  assert.doesNotThrow(() =>
    postContentDocumentFromTextAndMedia('@alice. next', [], false, null, [
      {
        end: '@alice'.length,
        handle: '@alice',
        profileId: aliceProfileId,
        relativeHandle: '@alice',
        start: 0,
      },
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
            handle: relativeHandle,
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
        handle: relativeHandle,
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
    'unknown block node',
    {
      type: 'doc',
      content: [{ type: 'future_block', content: [{ type: 'paragraph' }] }],
    },
  ],
  [
    'unknown inline node',
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'future_inline', text: 'body' }] }],
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

test('projects supported V1 nodes around unknown nodes without weakening strict validation', () => {
  const document = {
    version: 1,
    summary: 'warning',
    body: {
      type: 'doc',
      attrs: { futureFlag: true, sensitiveMedia: true },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            { type: 'future_inline', content: [{ type: 'text', text: 'hidden inline' }] },
            { type: 'hashtag', attrs: { hashtagId, token: '#Topic' } },
            {
              type: 'text',
              text: 'linked',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
            },
            { type: 'text', text: ' ' },
            { type: 'mention', attrs: { handle: '@alice', profileId: 'UHJvZmlsZS0x' } },
            { type: 'text', text: ' after' },
          ],
        },
        {
          type: 'future_block',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hidden block' }] }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'known sibling' }] },
        { type: 'media', attrs: { mediaId: 'media-1' } },
      ],
    },
  };

  assert.equal(isPostContentDocumentV1(document), false);
  assert.deepEqual(readPostContentDocumentV1(document), {
    version: 1,
    summary: 'warning',
    body: {
      type: 'doc',
      attrs: { futureFlag: true, sensitiveMedia: true },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'before ' },
            { type: 'hashtag', attrs: { hashtagId, token: '#Topic' } },
            {
              type: 'text',
              text: 'linked',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }],
            },
            { type: 'text', text: ' ' },
            { type: 'mention', attrs: { handle: '@alice', profileId: 'UHJvZmlsZS0x' } },
            { type: 'text', text: ' after' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'known sibling' }] },
        { type: 'media', attrs: { mediaId: 'media-1' } },
      ],
    },
  });
});

test('keeps document metadata in a read projection when every body node is unknown', () => {
  const document = readPostContentDocumentV1({
    version: 1,
    summary: 'warning',
    body: {
      type: 'doc',
      attrs: { sensitiveMedia: true },
      content: [{ type: 'future_block', content: [{ type: 'text', text: 'hidden' }] }],
    },
  });

  assert.deepEqual(document?.body.content, []);
  assert.equal(document?.summary, 'warning');
  assert.equal(document?.body.attrs?.sensitiveMedia, true);
});

test('read projection rejects malformed known nodes and unsupported document versions', () => {
  const invalidDocuments = [
    {
      version: 1,
      summary: null,
      body: { type: 'doc', content: [{ type: 'media', attrs: {} }] },
    },
    {
      version: 1,
      summary: null,
      body: { type: 'doc', content: [{ type: 'paragraph', content: { type: 'text' } }] },
    },
    {
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'hashtag', attrs: { hashtagId, token: '' } }],
          },
        ],
      },
    },
    {
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [{ type: 'hashtag', attrs: { hashtagId, token: '#tag' } }],
      },
    },
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
                text: 'unsafe',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      },
    },
    {
      version: 2,
      summary: null,
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
  ];

  for (const document of invalidDocuments) {
    assert.equal(readPostContentDocumentV1(document), null);
  }
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
  assert.equal(
    postContentDocumentToText(first, new Map([[aliceProfileId, '@alice@example.com']])),
    'Hello @alice@example.com',
  );
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

test('rejects Mention attrs without a valid Profile identity or with malformed fallback data', () => {
  for (const attrs of [
    { profileId: 'not-a-uuid' },
    { label: 123, profileId: aliceProfileId },
    { handle: '', profileId: aliceProfileId },
  ]) {
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
  assert.equal(
    isPostContentDocumentV1({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'mention', attrs: { handle: '', profileId: aliceProfileId } }],
          },
        ],
      },
    }),
    false,
  );
});

test('escapes captured Mention fallback text in unlinked HTML', () => {
  const document = canonicalizePostContentDocument({
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
              attrs: { handle: '<img src=x>', profileId: aliceProfileId },
            },
          ],
        },
      ],
    },
  });

  assert.equal(postContentDocumentToText(document), '<img src=x>');
  assert.equal(postContentDocumentToHtml(document), '<p><span>&lt;img src=x&gt;</span></p>');
});

test('links mapped Hashtags while preserving Mention and unmapped Hashtag fallbacks', () => {
  const firstHashtagId = hashtagId;
  const secondHashtagId = '019f6678-86fa-709b-984e-1520766b8444';
  const unmappedHashtagId = '019f6678-86fa-709b-984e-1520766b8445';
  const document = canonicalizePostContentDocument({
    version: 1,
    summary: null,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before ' },
            { type: 'mention', attrs: { profileId: aliceProfileId } },
            { type: 'text', text: ' ' },
            { type: 'hashtag', attrs: { hashtagId: firstHashtagId, token: '#MiXeD' } },
            { type: 'text', text: ' / ' },
            { type: 'hashtag', attrs: { hashtagId: secondHashtagId, token: '#second<&>' } },
            { type: 'text', text: ' / ' },
            { type: 'hashtag', attrs: { hashtagId: firstHashtagId, token: '#mixed' } },
            { type: 'text', text: ' / ' },
            { type: 'hashtag', attrs: { hashtagId: unmappedHashtagId, token: '#unmapped<&>' } },
          ],
        },
      ],
    },
  });

  assert.equal(
    postContentDocumentToHtml(
      document,
      undefined,
      new Map([
        [firstHashtagId, 'https://local.example/hashtags/first/posts'],
        [secondHashtagId, 'https://local.example/hashtags/second/posts'],
      ]),
    ),
    '<p>Before <span>@알 수 없는 사용자</span> ' +
      '<a href="https://local.example/hashtags/first/posts" rel="tag">#MiXeD</a> / ' +
      '<a href="https://local.example/hashtags/second/posts" rel="tag">#second&lt;&amp;&gt;</a> / ' +
      '<a href="https://local.example/hashtags/first/posts" rel="tag">#mixed</a> / ' +
      '<span>#unmapped&lt;&amp;&gt;</span></p>',
  );

  assert.throws(
    () =>
      postContentDocumentToHtml(
        document,
        undefined,
        new Map([[firstHashtagId, 'javascript:alert(1)']]),
      ),
    /Link href must use http or https/u,
  );
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
    validateLocalPostContentDocument(postContentDocumentFromText('가'.repeat(499), '😀')),
  );
  assert.throws(
    () => validateLocalPostContentDocument(postContentDocumentFromText('가'.repeat(500), '😀')),
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
      handle: relativeHandle,
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
  assert.equal(postContentDocumentToText(document), bodyText);
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
