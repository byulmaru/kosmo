import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LanguageString, Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import { PostVisibility } from '@kosmo/core/enums';
import { projectInboundCreateNote } from './inbound-create-note';

const actorUri = 'https://remote.example/users/alice';
const objectUri = 'https://remote.example/notes/1';
describe('inbound Create(Note)', () => {
  test('projects a public Note to primitive content input', async () => {
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

    const result = await projectInboundCreateNote({ actorUri, note, objectUri });

    assert.deepEqual(result, {
      content: '<p>Hello</p>',
      mediaType: 'text/html',
      published,
      summary: 'Content warning',
      visibility: PostVisibility.PUBLIC,
    });
  });

  test('deduplicates attribution hrefs and projects cc Public as UNLISTED', async () => {
    const note = new Note({
      attributions: [new URL(actorUri), new URL(actorUri)],
      cc: PUBLIC_COLLECTION,
      content: 'Hello',
      id: new URL(objectUri),
    });

    assert.equal(
      (await projectInboundCreateNote({ actorUri, note, objectUri }))?.visibility,
      PostVisibility.UNLISTED,
    );
  });

  test('rejects mismatched object identity', async () => {
    const note = new Note({
      attribution: new URL(actorUri),
      id: new URL('https://remote.example/notes/different'),
      to: PUBLIC_COLLECTION,
    });

    assert.equal(await projectInboundCreateNote({ actorUri, note, objectUri }), undefined);
  });

  test('rejects missing, multiple, or mismatched attribution', async () => {
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
      assert.equal(await projectInboundCreateNote({ actorUri, note, objectUri }), undefined);
    }
  });

  test('rejects IRI and ID-less embedded replies and non-public addressing', async () => {
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
        replyTarget: new Note({ content: 'Parent without an ID' }),
        to: PUBLIC_COLLECTION,
      }),
      new Note({
        attribution: new URL(actorUri),
        id: new URL(objectUri),
        to: new URL('https://remote.example/users/bob'),
      }),
    ];

    for (const note of notes) {
      assert.equal(await projectInboundCreateNote({ actorUri, note, objectUri }), undefined);
    }
  });
});
