import assert from 'node:assert/strict';
import test from 'node:test';
import { createId } from './id';

test('creates an RFC 9562 UUIDv7 with the current millisecond timestamp', () => {
  const now = 1_752_579_000_123;
  const originalNow = Date.now;
  Date.now = () => now;

  try {
    const id = createId();
    const hex = id.replaceAll('-', '');

    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(Number.parseInt(hex.slice(0, 12), 16), now);
  } finally {
    Date.now = originalNow;
  }
});

test('uses random UUIDv7 bits without promising monotonic order', () => {
  const ids = new Set(Array.from({ length: 32 }, () => createId()));

  assert.equal(ids.size, 32);
});
