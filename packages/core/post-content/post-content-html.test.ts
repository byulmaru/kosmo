import assert from 'node:assert/strict';
import test from 'node:test';
import { postContentDocumentToHtml } from './server';
import type { PostContentDocumentV1 } from './index';

const canonicalFixture = {
  version: 1,
  summary: null,
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'First <line> & ' },
          { type: 'hard_break' },
          {
            type: 'text',
            text: 'linked text',
            marks: [
              {
                type: 'link',
                attrs: { href: 'HTTPS://EXAMPLE.COM:443/a/../path?one=1&two=2' },
              },
            ],
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
    ],
  },
} as const;
const hashtagId = '019f6678-86fa-709b-984e-1520766b8443';

test('serializes the PROD-341 canonical fixture to deterministic safe HTML', () => {
  const expected =
    '<p>First &lt;line&gt; &amp; <br><a href="https://example.com/path?one=1&amp;two=2">linked text</a></p>' +
    '<p>Second paragraph</p>';

  assert.equal(postContentDocumentToHtml(canonicalFixture), expected);
  assert.equal(postContentDocumentToHtml(canonicalFixture), expected);
});

test('omits Media nodes from HTML projection', () => {
  assert.equal(
    postContentDocumentToHtml({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        attrs: { sensitiveMedia: true },
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          {
            type: 'media',
            attrs: {
              mediaId: '019f6678-86fa-709b-984e-1520766b8447',
            },
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
        ],
      },
    }),
    '<p>before</p><p>after</p>',
  );
});

test('serializes Mention identities with the unavailable Profile fallback', () => {
  assert.equal(
    postContentDocumentToHtml({
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
                attrs: { profileId: '019f6678-86fa-709b-984e-1520766b8441' },
              },
            ],
          },
        ],
      },
    }),
    '<p>Hello <span>@알 수 없는 사용자</span></p>',
  );
});

test('serializes Hashtag tokens as escaped, non-link inline text', () => {
  assert.equal(
    postContentDocumentToHtml({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Topic ' },
              { type: 'hashtag', attrs: { hashtagId, token: '#topic<&>' } },
            ],
          },
        ],
      },
    }),
    '<p>Topic <span>#topic&lt;&amp;&gt;</span></p>',
  );
});

test('serializes Custom Emoji metadata as escaped shortcode text without an image URL', () => {
  assert.equal(
    postContentDocumentToHtml({
      version: 1,
      summary: null,
      body: {
        type: 'doc',
        attrs: {
          customEmojis: [{ shortcode: ':party:', url: 'https://emoji.example/party.png' }],
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '<:party:>' }],
          },
        ],
      },
    }),
    '<p>&lt;:party:&gt;</p>',
  );
});

test('serializes resolved Mentions as escaped links and keeps fallback for unmapped targets', () => {
  const mappedProfileId = '019f6678-86fa-709b-984e-1520766b8441';
  const unmappedProfileId = '019f6678-86fa-709b-984e-1520766b8442';

  assert.equal(
    postContentDocumentToHtml(
      {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Hello ' },
                { type: 'mention', attrs: { profileId: mappedProfileId } },
                { type: 'text', text: ' and ' },
                { type: 'mention', attrs: { profileId: unmappedProfileId } },
              ],
            },
          ],
        },
      },
      new Map([[mappedProfileId, { href: 'https://profiles.example/@alice', label: '@alice<&' }]]),
    ),
    '<p>Hello <span class="h-card"><a href="https://profiles.example/@alice" class="u-url mention">@alice&lt;&amp;</a></span> and <span>@알 수 없는 사용자</span></p>',
  );
});

test('rejects unsafe resolved Mention hrefs at the HTML serialization boundary', () => {
  assert.throws(
    () =>
      postContentDocumentToHtml(
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
                    type: 'mention',
                    attrs: { profileId: '019f6678-86fa-709b-984e-1520766b8441' },
                  },
                ],
              },
            ],
          },
        },
        new Map([
          [
            '019f6678-86fa-709b-984e-1520766b8441',
            { href: 'javascript:alert(1)', label: '@alice' },
          ],
        ]),
      ),
    /Link href must use http or https/u,
  );
});

for (const [name, document] of [
  ['unsupported version', { ...canonicalFixture, version: 2 }],
  [
    'unsupported node',
    {
      ...canonicalFixture,
      body: { type: 'doc', content: [{ type: 'pre', content: [] }] },
    },
  ],
  [
    'unsupported mark',
    {
      ...canonicalFixture,
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
          },
        ],
      },
    },
  ],
  [
    'unknown attribute',
    {
      ...canonicalFixture,
      body: { type: 'doc', content: [{ type: 'paragraph', attrs: { class: 'unsafe' } }] },
    },
  ],
  [
    'unsafe link',
    {
      ...canonicalFixture,
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
  ],
] as const) {
  test(`rejects ${name} before producing HTML`, () => {
    assert.throws(() => postContentDocumentToHtml(document as unknown as PostContentDocumentV1));
  });
}
