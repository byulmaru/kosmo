import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNaturalLanguageMuteConditionWithinLimit,
  naturalLanguageMuteConditionMaxLength,
} from './natural-language-mute';

test('Natural Language Mute conditions count Unicode code points up to 250', () => {
  assert.equal(isNaturalLanguageMuteConditionWithinLimit(''), true);
  assert.equal(isNaturalLanguageMuteConditionWithinLimit('a'.repeat(249) + '😀'), true);
  assert.equal(isNaturalLanguageMuteConditionWithinLimit('a'.repeat(250) + '😀'), false);
  assert.equal(isNaturalLanguageMuteConditionWithinLimit('😀'.repeat(250)), true);
  assert.equal(isNaturalLanguageMuteConditionWithinLimit('😀'.repeat(251)), false);
});

test('Natural Language Mute length validation stops after 251 code points', (context) => {
  for (const condition of [
    'a'.repeat(naturalLanguageMuteConditionMaxLength * 2),
    'a'.repeat(10_000),
  ]) {
    let codePointsConsumed = 0;
    const originalIterator = String.prototype[Symbol.iterator];
    let withinLimit: boolean;

    try {
      context.mock.method(String.prototype, Symbol.iterator, function* (this: string) {
        const isCondition = this === condition;
        for (const codePoint of originalIterator.call(this)) {
          if (isCondition) {
            codePointsConsumed += 1;
            if (codePointsConsumed > naturalLanguageMuteConditionMaxLength + 1) {
              throw new Error('Condition validation consumed more than 251 code points');
            }
          }
          yield codePoint;
        }
      });
      withinLimit = isNaturalLanguageMuteConditionWithinLimit(condition);
    } finally {
      context.mock.restoreAll();
    }

    assert.equal(withinLimit, false);
    assert.ok(codePointsConsumed <= naturalLanguageMuteConditionMaxLength + 1);
  }
});
