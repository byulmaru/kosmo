import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  projectRemoteActivityPubHtmlToPlainText,
  projectRemoteNoteContent,
  RemoteNoteContentLengthExceededError,
  remoteNoteContentMaxLength,
  RemoteNoteMentionLimitExceededError,
} from './activitypub-note-content';
import { postContentDocumentToHtml, postContentDocumentToText } from './post-content/server';

const aliceProfileId = '019f6678-86fa-709b-984e-1520766b8441';
const bobProfileId = '019f6678-86fa-709b-984e-1520766b8442';

describe('projectRemoteNoteContent', () => {
  it('projects plain text into the canonical document and preserves internal newlines', () => {
    const result = projectRemoteNoteContent({
      content: '  first\r\nsecond\rthird  ',
      summary: null,
      mediaType: 'TEXT/PLAIN; Charset=UTF-8',
    });

    assert.deepEqual(result, {
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'first' },
              { type: 'hard_break' },
              { type: 'text', text: 'second' },
              { type: 'hard_break' },
              { type: 'text', text: 'third' },
            ],
          },
        ],
      },
    });
  });

  it('auto-links safe explicit HTTP URLs in incoming plain text', () => {
    const result = projectRemoteNoteContent({
      content: 'Visit HTTPS://EXAMPLE.COM:443/a/../path?one=1&two=2.',
      summary: null,
      mediaType: 'text/plain',
    });

    assert.deepEqual(result.body.content[0], {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Visit ' },
        {
          type: 'text',
          text: 'HTTPS://EXAMPLE.COM:443/a/../path?one=1&two=2',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/path?one=1&two=2' } }],
        },
        { type: 'text', text: '.' },
      ],
    });
  });

  // Source-derived synthetic fixture: Mastodon documents shortcode text plus a toot:Emoji tag
  // (https://github.com/mastodon/documentation/blob/main/content/en/spec/activitypub.md#emoji);
  // Misskey wraps the shortcode in U+200B (https://github.com/misskey-dev/misskey/blob/develop/packages/backend/src/core/MfmService.ts).
  it('stores matched synthetic remote Custom Emoji metadata without changing links or text', () => {
    const emoji = { shortcode: ':nyan:', url: 'https://misskey.example/files/nyan.webp' };
    const result = projectRemoteNoteContent({
      content:
        '<p>Hi \u200B:nyan:\u200B and <a href="https://example.com/:nyan:">:nyan:</a> ' +
        ':nyan::nyan:</p>',
      emojis: [emoji, emoji],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body, {
      type: 'doc',
      attrs: { customEmojis: [emoji] },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi \u200B:nyan:\u200B and ' },
            {
              type: 'text',
              text: ':nyan:',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/:nyan:' } }],
            },
            { type: 'text', text: ' :nyan::nyan:' },
          ],
        },
      ],
    });
    assert.equal(
      postContentDocumentToText(result),
      'Hi \u200B:nyan:\u200B and :nyan: :nyan::nyan:',
    );
  });

  it('does not store a shortcode that is part of a linked URL', () => {
    const result = projectRemoteNoteContent({
      content: 'See https://example.com/:nyan:',
      emojis: [{ shortcode: ':nyan:', url: 'https://emoji.example/nyan.webp' }],
      summary: null,
      mediaType: 'text/plain',
    });

    assert.deepEqual(result.body, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            {
              type: 'text',
              text: 'https://example.com/:nyan:',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/:nyan:' } }],
            },
          ],
        },
      ],
    });
  });

  it('keeps emoji-only Notes scoped to each Note mapping', () => {
    const first = projectRemoteNoteContent({
      content: ':nyan:',
      emojis: [{ shortcode: ':nyan:', url: 'https://emoji.example/first.webp' }],
      summary: null,
      mediaType: 'text/plain',
    });
    const second = projectRemoteNoteContent({
      content: ':nyan:',
      emojis: [{ shortcode: ':nyan:', url: 'https://emoji.example/second.webp' }],
      summary: null,
      mediaType: 'text/plain',
    });

    assert.deepEqual(first.body.attrs, {
      customEmojis: [{ shortcode: ':nyan:', url: 'https://emoji.example/first.webp' }],
    });
    assert.deepEqual(second.body.attrs, {
      customEmojis: [{ shortcode: ':nyan:', url: 'https://emoji.example/second.webp' }],
    });
    assert.equal(postContentDocumentToText(first), ':nyan:');
    assert.equal(postContentDocumentToText(second), ':nyan:');
  });

  it('keeps missing, malformed, and conflicting Custom Emoji mappings as text', () => {
    const source = ':missing: :broken: :conflict:';
    const result = projectRemoteNoteContent({
      content: source,
      emojis: [
        { shortcode: ':broken:', url: 'http://emoji.example/broken.png' },
        { shortcode: ':conflict:', url: 'https://emoji.example/one.png' },
        { shortcode: ':conflict:', url: 'https://emoji.example/two.png' },
      ],
      summary: null,
      mediaType: 'text/plain',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: source }],
      },
    ]);
    assert.equal(postContentDocumentToText(result), source);
  });

  it('projects absent-media-type HTML into paragraphs and hard breaks', () => {
    const result = projectRemoteNoteContent({
      content: '<div><p>Hello <strong>world</strong><br>again</p><p>Second &amp; final</p></div>',
      summary: null,
      mediaType: null,
    });

    assert.deepEqual(result.body, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'hard_break' },
            { type: 'text', text: 'again' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second & final' }] },
      ],
    });
  });

  it('preserves preformatted visible whitespace without introducing a pre node', () => {
    const result = projectRemoteNoteContent({
      content: '<p>before</p><pre>  first\r\n    second  </pre><p>after</p>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '  first' },
            { type: 'hard_break' },
            { type: 'text', text: '    second  ' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    });
  });

  it('preserves safe links and canonicalizes their absolute HTTP URL', () => {
    const result = projectRemoteNoteContent({
      content: '<p>visit <a href="HTTPS://Example.com:443/a/../b?q=1#top">Kosmo</a></p>',
      summary: null,
      mediaType: 'text/html',
    });

    const paragraph = result.body.content[0];
    assert.equal(paragraph?.type, 'paragraph');
    assert.deepEqual(
      JSON.parse(JSON.stringify(paragraph?.type === 'paragraph' ? paragraph.content : undefined)),
      [
        { type: 'text', text: 'visit ' },
        {
          type: 'text',
          text: 'Kosmo',
          marks: [{ type: 'link', attrs: { href: 'https://example.com/b?q=1#top' } }],
        },
      ],
    );
  });

  it('removes executable markup, unsafe URLs, attributes, and images while keeping safe text', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p onclick="steal()">safe <a href="javascript:steal()">link</a>' +
        '<img src="javascript:steal()" alt="secret"></p>' +
        '<span hidden>not visible</span>' +
        '<script>alert(1)</script><style>body{display:none}</style><template>hidden</template>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      { type: 'paragraph', content: [{ type: 'text', text: 'safe link' }] },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /onclick|javascript|secret|alert|display|hidden/u);
  });

  it('keeps text from unknown or malformed formatting markup', () => {
    const result = projectRemoteNoteContent({
      content: '<unknown>Hello <strong>world',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    ]);
  });

  it('projects summary into the canonical nullable Plain Text Content Warning', () => {
    const result = projectRemoteNoteContent({
      content: 'body',
      summary: '<p>CW <a href="https://example.com">label</a><script>hidden</script></p>',
      mediaType: 'text/plain',
    });

    assert.equal(result.summary, 'CW label');
    assert.equal(
      projectRemoteNoteContent({ content: 'body', summary: '  ', mediaType: 'text/plain' }).summary,
      null,
    );
    assert.equal(
      projectRemoteNoteContent({
        content: null,
        summary: '<em>warning</em>',
        mediaType: 'image/png',
      }).summary,
      'warning',
    );
  });

  it('rejects a canonical summary and body whose UTF-16 length exceeds 10,000', () => {
    assert.throws(
      () =>
        projectRemoteNoteContent({
          content: `<p>${'a'.repeat(10_000)}</p>`,
          summary: '<p>warning</p>',
          mediaType: 'text/html',
        }),
      RemoteNoteContentLengthExceededError,
    );
  });

  it('allows the exact limit and sums normalized summary and body text', () => {
    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: 'a'.repeat(9_999),
        summary: null,
        mediaType: 'text/plain',
      }),
    );
    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: 'a'.repeat(10_000),
        summary: null,
        mediaType: 'text/plain',
      }),
    );
    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: 'b'.repeat(5_000),
        summary: 'a'.repeat(5_000),
        mediaType: 'text/plain',
      }),
    );
    assert.throws(
      () =>
        projectRemoteNoteContent({
          content: 'b'.repeat(5_001),
          summary: 'a'.repeat(5_000),
          mediaType: 'text/plain',
        }),
      RemoteNoteContentLengthExceededError,
    );
  });

  it('counts a typed Mention anchor text in the remote Note length limit', () => {
    const nearLimit = 'a'.repeat(remoteNoteContentMaxLength - '@alice'.length + 1);
    const mention = {
      profileId: aliceProfileId,
      targetHref: 'https://remote.example/@alice',
    };
    const label = '@alice';

    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: nearLimit,
        summary: null,
        mediaType: 'text/plain',
      }),
    );
    assert.throws(
      () =>
        projectRemoteNoteContent({
          content: `<p>${nearLimit}<a href="${mention.targetHref}">${label}</a></p>`,
          mentions: [mention],
          summary: null,
          mediaType: 'text/html',
        }),
      RemoteNoteContentLengthExceededError,
    );
  });

  it('counts UTF-16 units after HTML and hard-break normalization', () => {
    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: `<p>${'a'.repeat(4_999)}<br>${'b'.repeat(4_999)}</p>`,
        summary: null,
        mediaType: 'text/html',
      }),
    );
    assert.doesNotThrow(() =>
      projectRemoteNoteContent({
        content: '😀'.repeat(5_000),
        summary: null,
        mediaType: 'text/plain',
      }),
    );
    assert.throws(
      () =>
        projectRemoteNoteContent({
          content: '😀'.repeat(5_001),
          summary: null,
          mediaType: 'text/plain',
        }),
      RemoteNoteContentLengthExceededError,
    );
  });

  it('allows absent and attachment-only content to produce the canonical empty document', () => {
    const result = projectRemoteNoteContent({ content: null, summary: null, mediaType: null });

    assert.deepEqual(result, {
      version: 1,
      summary: null,
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
  });

  it('rejects malformed and unsupported MIME types for present values', () => {
    assert.throws(
      () => projectRemoteNoteContent({ content: 'body', summary: null, mediaType: 'broken' }),
      /Malformed remote Note media type/u,
    );
    assert.throws(
      () => projectRemoteNoteContent({ content: 'body', summary: null, mediaType: 'image/png' }),
      /Unsupported remote Note media type/u,
    );
  });

  it('canonicalizes formatting-only HTML differences to the same document', () => {
    const compact = projectRemoteNoteContent({
      content: '<p>Hello <b>world</b></p><p>Next</p>',
      summary: null,
      mediaType: 'text/html',
    });
    const formatted = projectRemoteNoteContent({
      content: '<div>\n  <p>Hello <em>world</em></p>\n  <p>Next</p>\n</div>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(formatted, compact);
  });

  it('captures the resolved Profile handle for typed Mentions without trusting anchor text', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p>Hello <a class="h-card" href="https://remote.example/@alice">@spoof</a> and ' +
        '<span class="h-card"><a class="u-url mention" href="https://remote.example/@bob">' +
        '<span class="p-name">@bob</span></a></span> and ' +
        '<a href="https://example.com/guide">guide</a></p>',
      mentions: [
        {
          profileId: aliceProfileId,
          relativeHandle: '@alice@remote.example',
          targetHref: 'https://remote.example/@alice',
        },
        {
          profileId: bobProfileId,
          relativeHandle: '@bob@remote.example',
          targetHref: 'https://remote.example/@bob',
        },
        {
          profileId: aliceProfileId,
          targetHref: 'https://remote.example/@alice',
        },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          {
            type: 'mention',
            attrs: { handle: '@alice@remote.example', profileId: aliceProfileId },
          },
          { type: 'text', text: ' and ' },
          {
            type: 'mention',
            attrs: { handle: '@bob@remote.example', profileId: bobProfileId },
          },
          { type: 'text', text: ' and ' },
          {
            type: 'text',
            text: 'guide',
            marks: [{ type: 'link', attrs: { href: 'https://example.com/guide' } }],
          },
        ],
      },
    ]);
    assert.equal(
      postContentDocumentToText(result),
      'Hello @alice@remote.example and @bob@remote.example and guide',
    );
    assert.equal(
      postContentDocumentToText(
        result,
        new Map([
          [aliceProfileId, '@alice-current@remote.example'],
          [bobProfileId, '@bob-current@remote.example'],
        ]),
      ),
      'Hello @alice-current@remote.example and @bob-current@remote.example and guide',
    );
    assert.equal(
      postContentDocumentToHtml(result),
      '<p>Hello <span>@alice@remote.example</span> and <span>@bob@remote.example</span> and ' +
        '<a href="https://example.com/guide">guide</a></p>',
    );
  });

  it('keeps a Mention anchor with an unmatched URL as a safe link', () => {
    const result = projectRemoteNoteContent({
      content: '<p><a href="https://evil.example/login">@alice</a></p>',
      mentions: [
        {
          profileId: aliceProfileId,
          targetHref: 'https://remote.example/users/alice',
        },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            marks: [{ attrs: { href: 'https://evil.example/login' }, type: 'link' }],
            text: '@alice',
            type: 'text',
          },
        ],
      },
    ]);
  });

  it('keeps microformats h-card anchors as ordinary links without typed candidates', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p><a class="h-card" href="https://remote.example/@alice">@alice</a> ' +
        '<span class="h-card"><a class="u-url mention" href="https://remote.example/@bob">' +
        '<span class="p-name">@bob</span></a></span></p>',
      mentions: [],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '@alice',
            marks: [{ type: 'link', attrs: { href: 'https://remote.example/@alice' } }],
          },
          { type: 'text', text: ' ' },
          {
            type: 'text',
            text: '@bob',
            marks: [{ type: 'link', attrs: { href: 'https://remote.example/@bob' } }],
          },
        ],
      },
    ]);
  });

  it('does not use another candidate when an anchor href is unmatched', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p><a href="https://remote.example/users/alice">@alice</a> ' +
        '<a href="https://remote.example/users/bob">@alice</a> ' +
        '<a href="https://remote.example/users/unknown">@alice</a></p>',
      mentions: [
        {
          profileId: aliceProfileId,
          targetHref: 'https://remote.example/users/alice',
        },
        {
          profileId: bobProfileId,
          targetHref: 'https://remote.example/users/bob',
        },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            type: 'mention',
            attrs: { profileId: aliceProfileId },
          },
          { type: 'text', text: ' ' },
          {
            type: 'mention',
            attrs: { profileId: bobProfileId },
          },
          { type: 'text', text: ' ' },
          {
            marks: [
              {
                attrs: { href: 'https://remote.example/users/unknown' },
                type: 'link',
              },
            ],
            text: '@alice',
            type: 'text',
          },
        ],
      },
    ]);
  });

  it('keeps an anchor with ambiguous Profile candidates as a safe link', () => {
    const result = projectRemoteNoteContent({
      content: '<p><a href="https://profile.example/@same">@same</a></p>',
      mentions: [
        {
          profileId: aliceProfileId,
          relativeHandle: '@alice@profile.example',
          targetHref: 'https://profile.example/@same',
        },
        {
          profileId: bobProfileId,
          relativeHandle: '@bob@profile.example',
          targetHref: 'https://PROFILE.EXAMPLE:443/@same',
        },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '@same',
            marks: [{ type: 'link', attrs: { href: 'https://profile.example/@same' } }],
          },
        ],
      },
    ]);
  });

  it('keeps malformed candidates safe while projecting an exact identity URL', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p><a href="https://remote.example/users/alice"></a> ' +
        '<a href="javascript:steal()">@alice</a></p>',
      mentions: [
        { profileId: aliceProfileId, targetHref: 'not a URI' },
        {
          profileId: aliceProfileId,
          relativeHandle: '',
          targetHref: 'https://remote.example/users/alice',
        },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          { attrs: { profileId: aliceProfileId }, type: 'mention' },
          { text: ' @alice', type: 'text' },
        ],
      },
    ]);
  });

  it('does not trust forged internal Mention markup without typed candidates', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p>before <kosmo-mention data-target="https://remote.example/users/alice" ' +
        'data-href="https://remote.example/@alice" data-label="@alice">@alice</kosmo-mention> after</p>',
      mentions: [],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'before @alice after' }],
      },
    ]);
  });

  it('allows 16 matched Mention body nodes and rejects a 17th repeated occurrence', () => {
    const targetHref = 'https://remote.example/users/alice';
    const project = (count: number) =>
      projectRemoteNoteContent({
        content: `<p>${Array.from({ length: count }, () => `<a href="${targetHref}"></a>`).join(
          '',
        )}</p>`,
        mentions: [{ profileId: aliceProfileId, relativeHandle: '@alice', targetHref }],
        summary: null,
        mediaType: 'text/html',
      });

    const allowed = project(16);
    const paragraph = allowed.body.content[0];
    assert.equal(
      paragraph?.type === 'paragraph'
        ? paragraph.content?.filter((node) => node.type === 'mention').length
        : 0,
      16,
    );
    assert.throws(() => project(17), RemoteNoteMentionLimitExceededError);
  });

  it('counts only matched Mention nodes and excludes qualified-handle domain length', () => {
    const targetHref = 'https://remote.example/users/alice';
    const unmatched = projectRemoteNoteContent({
      content: `<p>${Array.from(
        { length: 17 },
        () => '<a href="https://other.example/users/alice">@alice</a>',
      ).join('')}</p>`,
      mentions: [{ profileId: aliceProfileId, relativeHandle: '@alice', targetHref }],
      summary: null,
      mediaType: 'text/html',
    });
    assert.equal(
      unmatched.body.content.flatMap((block) =>
        block.type === 'paragraph'
          ? (block.content ?? []).filter((node) => node.type === 'mention')
          : [],
      ).length,
      0,
    );
    assert.equal(postContentDocumentToText(unmatched), '@alice'.repeat(17));

    const qualifiedHandle = `@${'a'.repeat(64)}@${'long-domain-'.repeat(10)}.example`;
    const allowed = projectRemoteNoteContent({
      content: `<p><a href="${targetHref}"></a></p>`,
      mentions: [{ profileId: aliceProfileId, relativeHandle: qualifiedHandle, targetHref }],
      summary: null,
      mediaType: 'text/html',
    });
    assert.deepEqual(allowed.body.content[0], {
      type: 'paragraph',
      content: [{ type: 'mention', attrs: { handle: qualifiedHandle, profileId: aliceProfileId } }],
    });
  });

  it('rejects a matched Mention whose username exceeds 64 characters', () => {
    const targetHref = 'https://remote.example/users/alice';
    assert.throws(
      () =>
        projectRemoteNoteContent({
          content: `<p><a href="${targetHref}"></a></p>`,
          mentions: [
            {
              profileId: aliceProfileId,
              relativeHandle: `@${'a'.repeat(65)}@example.com`,
              targetHref,
            },
          ],
          summary: null,
          mediaType: 'text/html',
        }),
      RemoteNoteMentionLimitExceededError,
    );
  });
});

describe('projectRemoteActivityPubHtmlToPlainText', () => {
  it('projects visible HTML semantics while removing non-visible and unsafe content', () => {
    assert.equal(
      projectRemoteActivityPubHtmlToPlainText(
        '<p>Hello &amp; <a href="https://example.com">world</a><br>again</p>' +
          '<p>Second</p><img src="https://example.com/image.png" alt="hidden">' +
          '<span hidden>not visible</span>' +
          '<script>alert(1)</script><style>body{display:none}</style><template>secret</template>',
      ),
      'Hello & world\nagain\n\nSecond',
    );
  });

  it('keeps visible text from malformed and unknown markup', () => {
    assert.equal(
      projectRemoteActivityPubHtmlToPlainText('<unknown>Hello <strong>world</strong>'),
      'Hello world',
    );
  });

  it('normalizes an empty projection to an empty string for nullable callers', () => {
    assert.equal(
      projectRemoteActivityPubHtmlToPlainText('<script>hidden</script><style>hidden</style>'),
      '',
    );
  });
});
