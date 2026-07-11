import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDate } from '@kosmo/core/datetime';
import { Temporal } from 'temporal-polyfill';
import { formatTimelineTimestamp } from './date';

describe('timeline timestamp', () => {
  const now = Temporal.Instant.from('2026-07-11T12:00:00.000Z');

  it('keeps the existing relative-time copy for posts under one day old', () => {
    assert.equal(formatTimelineTimestamp(now.toString(), now), '지금');
    assert.equal(formatTimelineTimestamp(now.subtract({ seconds: 30 }).toString(), now), '30초 전');
    assert.equal(formatTimelineTimestamp(now.subtract({ minutes: 5 }).toString(), now), '5분 전');
    assert.equal(formatTimelineTimestamp(now.subtract({ hours: 3 }).toString(), now), '3시간 전');
  });

  it('shows the full date after one day', () => {
    const value = now.subtract({ hours: 48 });

    assert.equal(formatTimelineTimestamp(value.toString(), now), formatDate(value));
  });
});
