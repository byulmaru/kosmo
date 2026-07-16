import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectRemoteNoteContent } from './activitypub-note-content';
import { canonicalizePostContentDocument } from './post-content/server';

function assertCanonical(result: ReturnType<typeof projectRemoteNoteContent>) {
  assert.deepEqual(canonicalizePostContentDocument(result), result);
}

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
    assertCanonical(result);
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
    assertCanonical(result);
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
    assertCanonical(result);
  });

  it('preserves safe links and canonicalizes their absolute HTTP URL', () => {
    const result = projectRemoteNoteContent({
      content: '<p>visit <a href="HTTPS://Example.com:443/a/../b?q=1#top">Kosmo</a></p>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(JSON.parse(JSON.stringify(result.body.content[0]?.content)), [
      { type: 'text', text: 'visit ' },
      {
        type: 'text',
        text: 'Kosmo',
        marks: [{ type: 'link', attrs: { href: 'https://example.com/b?q=1#top' } }],
      },
    ]);
    assertCanonical(result);
  });

  it('removes executable markup, unsafe URLs, attributes, and images while keeping safe text', () => {
    const result = projectRemoteNoteContent({
      content:
        '<p onclick="steal()">safe <a href="javascript:steal()">link</a>' +
        '<img src="javascript:steal()" alt="secret"></p>' +
        '<script>alert(1)</script><style>body{display:none}</style><template>hidden</template>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.deepEqual(result.body.content, [
      { type: 'paragraph', content: [{ type: 'text', text: 'safe link' }] },
    ]);
    assert.doesNotMatch(JSON.stringify(result), /onclick|javascript|secret|alert|display|hidden/u);
    assertCanonical(result);
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
    assertCanonical(result);
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
    assertCanonical(result);
  });

  it('allows absent and attachment-only content to produce the canonical empty document', () => {
    const result = projectRemoteNoteContent({ content: null, summary: null, mediaType: null });

    assert.deepEqual(result, {
      version: 1,
      summary: null,
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    assertCanonical(result);
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
    assertCanonical(formatted);
  });
});
