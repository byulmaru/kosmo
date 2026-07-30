import assert from 'node:assert/strict';
import test from 'node:test';
import { isWalArchived } from './contract-restore-point';

test('accepts the target WAL or a later archived WAL', () => {
  assert.equal(isWalArchived('00000001000000000000000A', '00000001000000000000000A'), true);
  assert.equal(isWalArchived('00000001000000000000000A', '00000001000000000000000B'), true);
});

test('rejects missing, malformed, or earlier archived WAL', () => {
  assert.equal(isWalArchived('00000001000000000000000A', null), false);
  assert.equal(isWalArchived('00000001000000000000000A', '000000010000000000000009'), false);
  assert.equal(isWalArchived('not-a-wal', '00000001000000000000000B'), false);
});
