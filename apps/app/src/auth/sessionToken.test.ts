import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeSessionToken,
  parseStoredSessionToken,
  serializeStoredSessionToken,
} from './sessionToken';

describe('session token storage value', () => {
  it('accepts an opaque non-empty token', () => {
    assert.equal(normalizeSessionToken('opaque-token'), 'opaque-token');
  });

  it('rejects missing and blank storage values', () => {
    assert.equal(normalizeSessionToken(null), null);
    assert.equal(normalizeSessionToken('  '), null);
  });
});

describe('origin-bound session token storage', () => {
  const origin = 'https://kosmo.example';

  it('returns a token only for the origin that stored it', () => {
    const stored = serializeStoredSessionToken(origin, 'opaque-token');

    assert.equal(parseStoredSessionToken(stored, origin), 'opaque-token');
    assert.equal(parseStoredSessionToken(stored, 'https://staging.kosmo.example'), null);
  });

  it('rejects legacy and malformed storage values', () => {
    assert.equal(parseStoredSessionToken('opaque-token', origin), null);
    assert.equal(parseStoredSessionToken('{"origin":1,"token":"opaque-token"}', origin), null);
    assert.equal(parseStoredSessionToken('{"origin":"https://kosmo.example"}', origin), null);
  });

  it('does not serialize a blank token', () => {
    assert.throws(() => serializeStoredSessionToken(origin, '  '));
  });
});
