import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LanguageString, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import { PostVisibility } from '@kosmo/core/enums';
import { handleInboundCreateNote } from './inbound-create-note';

const actorUri = 'https://remote.example/users/alice';
const objectUri = 'https://remote.example/notes/1';
const receivedAt = Temporal.Instant.from('2026-07-16T00:00:00Z');

describe('inbound Create(Note)', () => {
  test('projects a public Note to primitive materialization input', () => {
    const published = Temporal.Instant.from('2026-07-15T12:00:00Z');
    const note = new Note({
      attribution: new URL(actorUri),
      content: new LanguageString('<p>Hello</p>', 'en'),
      id: new URL(objectUri),
      mediaType: 'text/html',
      published,
      summary: new LanguageString('Content warning', 'en'),
      to: PUBLIC_COLLECTION,
    });

    const result = handleInboundCreateNote({ actorUri, note, objectUri, receivedAt });

    assert.deepEqual(result, {
      actorUri,
      content: '<p>Hello</p>',
      mediaType: 'text/html',
      objectUri,
      published,
      receivedAt,
      summary: 'Content warning',
      visibility: PostVisibility.PUBLIC,
    });
  });

  test('deduplicates attribution hrefs and projects cc Public as UNLISTED', () => {
    const note = new Note({
      attributions: [new URL(actorUri), new URL(actorUri)],
      cc: PUBLIC_COLLECTION,
      content: 'Hello',
      id: new URL(objectUri),
    });

    assert.equal(
      handleInboundCreateNote({ actorUri, note, objectUri, receivedAt })?.visibility,
      PostVisibility.UNLISTED,
    );
  });

  test('rejects mismatched object identity', () => {
    const note = new Note({
      attribution: new URL(actorUri),
      id: new URL('https://remote.example/notes/different'),
      to: PUBLIC_COLLECTION,
    });

    assert.equal(handleInboundCreateNote({ actorUri, note, objectUri, receivedAt }), undefined);
  });

  test('rejects missing, multiple, or mismatched attribution', () => {
    const notes = [
      new Note({ id: new URL(objectUri), to: PUBLIC_COLLECTION }),
      new Note({
        attribution: new URL('https://remote.example/users/mallory'),
        id: new URL(objectUri),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attributions: [new URL(actorUri), new URL('https://remote.example/users/mallory')],
        id: new URL(objectUri),
        to: PUBLIC_COLLECTION,
      }),
    ];

    for (const note of notes) {
      assert.equal(handleInboundCreateNote({ actorUri, note, objectUri, receivedAt }), undefined);
    }
  });

  test('rejects replies and non-public addressing', () => {
    const notes = [
      new Note({
        attribution: new URL(actorUri),
        id: new URL(objectUri),
        replyTarget: new URL('https://remote.example/notes/parent'),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: new URL(actorUri),
        id: new URL(objectUri),
        to: new URL('https://remote.example/users/bob'),
      }),
    ];

    for (const note of notes) {
      assert.equal(handleInboundCreateNote({ actorUri, note, objectUri, receivedAt }), undefined);
    }
  });
});
