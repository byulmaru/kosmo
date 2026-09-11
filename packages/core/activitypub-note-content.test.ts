import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  projectRemoteActivityPubHtmlToPlainText,
  projectRemoteNoteContent,
  RemoteNoteContentLengthExceededError,
  remoteNoteContentMaxLength,
} from './activitypub-note-content';

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

  it('counts a typed Mention label in the remote Note length limit', () => {
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

  it('projects typed Mention candidates onto safe anchor labels without using tag labels', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p>Hello <a class="h-card" href="https://remote.example/@alice">@alice</a> and ' +
        '<span class="h-card"><a class="u-url mention" href="https://remote.example/@bob">' +
        '<span class="p-name">@bob</span></a></span> and ' +
        '<a href="https://example.com/guide">guide</a></p>',
      mentions: [
        {
          profileId: aliceProfileId,
          targetHref: 'https://remote.example/@alice',
        },
        {
          profileId: bobProfileId,
          targetHref: 'https://remote.example/@bob',
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
            attrs: {
              label: '@alice',
              profileId: aliceProfileId,
            },
          },
          { type: 'text', text: ' and ' },
          {
            type: 'mention',
            attrs: {
              label: '@bob',
              profileId: bobProfileId,
            },
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
            attrs: {
              label: '@alice',
              profileId: aliceProfileId,
            },
          },
          { type: 'text', text: ' ' },
          {
            type: 'mention',
            attrs: {
              label: '@alice',
              profileId: bobProfileId,
            },
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

  it('keeps malformed candidates and unsafe visible labels as safe links', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p><a href="https://remote.example/users/alice"></a> ' +
        '<a href="javascript:steal()">@alice</a></p>',
      mentions: [
        { profileId: aliceProfileId, targetHref: 'not a URI' },
        { profileId: aliceProfileId, targetHref: 'https://remote.example/users/alice' },
      ],
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      {
        type: 'paragraph',
        content: [
          {
            text: '@alice',
            type: 'text',
          },
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
