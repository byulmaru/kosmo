import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeReactionPeopleReturnToOrigin,
  getReactionPeopleHref,
  hasReactionPeopleReturnToOrigin,
  rememberReactionPeopleReturnFocus,
  resolveReactionPeopleType,
  restoreReactionPeopleReturnFocus,
} from './reactionPeopleRoute';

describe('reaction people route helpers', () => {
  it('keeps a requested positive Type and falls back in server order', () => {
    const entries = [
      { count: 0, type: '🥹' },
      { count: 2, type: '❤️' },
      { count: 1, type: '🎉' },
    ];

    assert.equal(resolveReactionPeopleType(entries, '🎉'), '🎉');
    assert.equal(resolveReactionPeopleType(entries, '👀'), '❤️');
    assert.equal(resolveReactionPeopleType(entries), '❤️');
  });

  it('returns no Type when there are no positive counts', () => {
    assert.equal(resolveReactionPeopleType([{ count: 0, type: '❤️' }], '❤️'), null);
  });

  it('encodes an optional Type in the canonical People URL', () => {
    assert.equal(
      getReactionPeopleHref('@writer', 'post-1', '❤️ & joy'),
      '/@writer/post-1/reactions?type=%E2%9D%A4%EF%B8%8F%20%26%20joy',
    );
    assert.equal(getReactionPeopleHref('@writer', 'post-1'), '/@writer/post-1/reactions');
  });

  it('remembers an in-app origin independently from browser focus support', () => {
    rememberReactionPeopleReturnFocus('/@writer/post-1/reactions');
    assert.equal(hasReactionPeopleReturnToOrigin(), true);
    assert.equal(consumeReactionPeopleReturnToOrigin(), true);
    assert.equal(hasReactionPeopleReturnToOrigin(), false);
    assert.equal(consumeReactionPeopleReturnToOrigin(), false);
  });

  it('falls back to the shell target when the original control is gone', () => {
    const global = globalThis as unknown as {
      document?: unknown;
      requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    };
    const previousDocument = global.document;
    const previousAnimationFrame = global.requestAnimationFrame;
    let fallbackFocusCount = 0;
    global.document = {
      getElementById: () => null,
      querySelectorAll: () => {
        throw new Error('exact focus ids must not fall back to an unrelated anchor');
      },
    };
    global.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };

    try {
      rememberReactionPeopleReturnFocus('/@writer/post-1/reactions', 'missing', () => {
        fallbackFocusCount += 1;
      });
      restoreReactionPeopleReturnFocus();
      assert.equal(fallbackFocusCount, 1);
      assert.equal(consumeReactionPeopleReturnToOrigin(), true);
    } finally {
      global.document = previousDocument;
      global.requestAnimationFrame = previousAnimationFrame;
    }
  });
});
