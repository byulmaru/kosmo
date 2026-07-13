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

describe('native-configuration-bound session token storage', () => {
  const configuration = {
    apiOrigin: 'https://api.kosmo.example',
    clientId: 'native-client',
    issuer: 'https://id.kosmo.example',
  };

  it('returns a token only for the native configuration that stored it', () => {
    const stored = serializeStoredSessionToken(configuration, 'opaque-token');

    assert.equal(parseStoredSessionToken(stored, configuration), 'opaque-token');
    assert.equal(
      parseStoredSessionToken(stored, {
        ...configuration,
        apiOrigin: 'https://api.staging.kosmo.example',
      }),
      null,
    );
    assert.equal(
      parseStoredSessionToken(stored, {
        ...configuration,
        issuer: 'https://id.staging.kosmo.example',
      }),
      null,
    );
    assert.equal(
      parseStoredSessionToken(stored, { ...configuration, clientId: 'other-client' }),
      null,
    );
  });

  it('rejects legacy and malformed storage values', () => {
    assert.equal(parseStoredSessionToken('opaque-token', configuration), null);
    assert.equal(
      parseStoredSessionToken(
        JSON.stringify({ origin: 'https://kosmo.example', token: 'opaque-token' }),
        configuration,
      ),
      null,
    );
    assert.equal(
      parseStoredSessionToken(
        JSON.stringify({ apiOrigin: configuration.apiOrigin }),
        configuration,
      ),
      null,
    );
  });

  it('does not serialize a blank token', () => {
    assert.throws(() => serializeStoredSessionToken(configuration, '  '));
  });
});
