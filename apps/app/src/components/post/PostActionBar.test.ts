import assert from 'node:assert/strict';
import test from 'node:test';

test('formats supplied non-Reaction counts with standard compact notation', async () => {
  const module = await import('./postActionCount').catch(() => null);

  assert.ok(module, 'post action count formatter module must exist');
  for (const locale of ['en-US', 'ko-KR']) {
    const expected = new Intl.NumberFormat(locale, {
      compactDisplay: 'short',
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(12_345);

    assert.equal(module.formatPostActionCount(12_345, locale), expected);
  }
});

test('does not synthesize a count when none is supplied', async () => {
  const module = await import('./postActionCount').catch(() => null);

  assert.ok(module, 'post action count formatter module must exist');
  assert.equal(module.formatPostActionCount(undefined), undefined);
});

test('omits invalid count inputs instead of formatting them', async () => {
  const module = await import('./postActionCount');

  for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(module.formatPostActionCount(count), undefined);
  }
});
