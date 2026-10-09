import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reactionEmojiValues } from '@kosmo/core/validation';
import { getReactionEmojiAnalyticsKey } from './reaction';

describe('Reaction analytics keys', () => {
  it('maps every allowed Unicode reaction to a distinct full-sequence key', () => {
    const keys = reactionEmojiValues.map((value) => getReactionEmojiAnalyticsKey(value));
    const mappedKeys = keys.filter((key): key is string => key !== null);

    assert.equal(mappedKeys.length, reactionEmojiValues.length);
    assert.equal(new Set(mappedKeys).size, reactionEmojiValues.length);
  });

  it('preserves variation selectors, regional indicators, and skin-tone modifiers', () => {
    assert.equal(getReactionEmojiAnalyticsKey('❤️'), 'unicode:2764-fe0f');
    assert.equal(getReactionEmojiAnalyticsKey('❤'), null);
    assert.equal(getReactionEmojiAnalyticsKey('🇰🇷'), 'unicode:1f1f0-1f1f7');
    assert.equal(getReactionEmojiAnalyticsKey('👍🏽'), 'unicode:1f44d-1f3fd');
  });

  it('preserves complete zero-width-joiner sequences', () => {
    assert.equal(
      getReactionEmojiAnalyticsKey('👨‍👩‍👧‍👦'),
      'unicode:1f468-200d-1f469-200d-1f467-200d-1f466',
    );
  });

  it('does not create a key for unrecognized or user-defined values', () => {
    assert.equal(getReactionEmojiAnalyticsKey('custom:party'), null);
    assert.equal(getReactionEmojiAnalyticsKey(''), null);
  });
});
