import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Link, Mention, Note } from '@fedify/vocab';
import { collectInboundMentionCandidates } from './inbound-mention';

test('filters non-HTTP Mentions and ordinary Links without fetching', async () => {
  const note = new Note({
    content: '<p><a href="mailto:alice@example.com">@alice</a></p>',
    id: new URL('https://remote.example/notes/1'),
    tags: [
      new Mention({
        href: new URL('mailto:alice@example.com'),
        name: '@alice',
      }),
      new Link({
        href: new URL('https://example.com/guide'),
        name: 'guide',
      }),
    ],
  });

  assert.deepEqual(await collectInboundMentionCandidates(note), []);
});

test('does not fetch URL-only tags while collecting typed Mentions', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Mention collection must not fetch remote tags');
  });
  try {
    const note = new Note({
      content: '<p>unresolved</p>',
      id: new URL('https://remote.example/notes/2'),
      tags: [new URL('https://remote.example/users/unresolved')],
    });

    assert.deepEqual(await collectInboundMentionCandidates(note), []);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});
