import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { postContentDocumentToHtml } from './server';

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

test('serializes the PROD-341 canonical fixture to deterministic safe HTML', () => {
  const expected =
    '<p>First &lt;line&gt; &amp; <br><a href="https://example.com/path?one=1&amp;two=2">linked text</a></p>' +
    '<p>Second paragraph</p>';

  assert.equal(postContentDocumentToHtml(canonicalFixture), expected);
  assert.equal(postContentDocumentToHtml(canonicalFixture), expected);
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
    assert.throws(() => postContentDocumentToHtml(document));
  });
}

test('keeps the ProseMirror runtime behind the server-only package export', async () => {
  const corePackage = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const appPackage = JSON.parse(
    await readFile(new URL('../../../apps/app/package.json', import.meta.url), 'utf8'),
  );
  const clientEntry = await readFile(new URL('./index.ts', import.meta.url), 'utf8');

  assert.equal(corePackage.exports['./post-content'], './post-content/index.ts');
  assert.equal(corePackage.exports['./post-content/server'], './post-content/server.ts');
  assert.doesNotMatch(clientEntry, /\.\/server/u);
  assert.doesNotMatch(clientEntry, /prosemirror-model/u);
  assert.equal(appPackage.dependencies['prosemirror-model'], undefined);
});
