import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectRemoteNoteContent } from './activitypub-note-content';

describe('projectRemoteNoteContent', () => {
  it('normalizes plain text MIME parameters and preserves internal newlines', () => {
    assert.deepEqual(
      projectRemoteNoteContent({
        content: '  first\r\nsecond\rthird  ',
        summary: null,
        mediaType: 'TEXT/PLAIN; Charset=UTF-8',
      }),
      { bodyText: 'first\nsecond\nthird', contentWarning: null },
    );
  });

  it('projects absent-media-type HTML into consistent block boundaries', () => {
    const projection = projectRemoteNoteContent({
      content: '<div><p>Hello <strong>world</strong></p><p>Second &amp; final</p></div>',
      summary: null,
      mediaType: null,
    });

    assert.equal(projection.bodyText, 'Hello world\nSecond & final');
  });

  it('removes executable markup, attributes, URLs, and images while keeping link text', () => {
    const projection = projectRemoteNoteContent({
      content:
        '<p onclick="steal()">safe <a href="javascript:steal()">link</a>' +
        '<img src="javascript:steal()" alt="secret"></p>' +
        '<script>alert(1)</script><style>body{display:none}</style>',
      summary: null,
      mediaType: 'text/html',
    });

    assert.equal(projection.bodyText, 'safe link');
    assert.doesNotMatch(projection.bodyText, /onclick|javascript|secret|alert|display/u);
  });

  it('keeps text from unknown or malformed markup without keeping the markup', () => {
    assert.equal(
      projectRemoteNoteContent({
        content: '<unknown>Hello <strong>world',
        summary: null,
        mediaType: 'text/html',
      }).bodyText,
      'Hello world',
    );
  });

  it('uses the same safe projection for summary and maps empty summaries to null', () => {
    assert.deepEqual(
      projectRemoteNoteContent({
        content: '<p>body</p>',
        summary: '<p>CW <script>hidden</script></p>',
        mediaType: 'text/html',
      }),
      { bodyText: 'body', contentWarning: 'CW' },
    );
    assert.equal(
      projectRemoteNoteContent({ content: 'body', summary: '  ', mediaType: 'text/plain' })
        .contentWarning,
      null,
    );
  });

  it('allows absent and attachment-only content to produce an empty body', () => {
    assert.deepEqual(projectRemoteNoteContent({ content: null, summary: null, mediaType: null }), {
      bodyText: '',
      contentWarning: null,
    });
  });

  it('rejects malformed and unsupported MIME types', () => {
    assert.throws(
      () => projectRemoteNoteContent({ content: 'body', summary: null, mediaType: 'broken' }),
      /Malformed remote Note media type/u,
    );
    assert.throws(
      () => projectRemoteNoteContent({ content: 'body', summary: null, mediaType: 'image/png' }),
      /Unsupported remote Note media type/u,
    );
  });

  it('canonicalizes formatting-only HTML differences to the same plain text', () => {
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
});
