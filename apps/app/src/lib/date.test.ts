import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTimelineTimestamp } from './date';

describe('timeline timestamp', () => {
  const now = Date.parse('2026-07-11T12:00:00.000Z');

  it('keeps the existing relative-time copy for posts under one day old', () => {
    assert.equal(formatTimelineTimestamp(new Date(now).toISOString(), now), '지금');
    assert.equal(formatTimelineTimestamp(new Date(now - 30_000).toISOString(), now), '30초 전');
    assert.equal(formatTimelineTimestamp(new Date(now - 5 * 60_000).toISOString(), now), '5분 전');
    assert.equal(
      formatTimelineTimestamp(new Date(now - 3 * 60 * 60_000).toISOString(), now),
      '3시간 전',
    );
  });

  it('shows the full date after one day', () => {
    const value = new Date(now - 2 * 24 * 60 * 60_000);
    const expected = value
      .toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\.$/, '');

    assert.equal(formatTimelineTimestamp(value.toISOString(), now), expected);
  });
});
