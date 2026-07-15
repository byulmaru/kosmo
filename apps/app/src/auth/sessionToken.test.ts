import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeSessionToken,
  parseStoredSessionToken,
  serializeStoredSessionToken,
} from './sessionToken';

describe('세션 토큰 저장 값', () => {
  it('비어 있지 않은 opaque token을 허용한다', () => {
    assert.equal(normalizeSessionToken('opaque-token'), 'opaque-token');
  });

  it('누락되거나 빈 저장 값을 거부한다', () => {
    assert.equal(normalizeSessionToken(null), null);
    assert.equal(normalizeSessionToken('  '), null);
  });
});

describe('native 설정에 결속된 세션 토큰 저장 값', () => {
  const configuration = {
    apiOrigin: 'https://api.kosmo.example',
    clientId: 'native-client',
    issuer: 'https://id.kosmo.example',
  };

  it('저장 당시 native 설정과 일치할 때만 토큰을 반환한다', () => {
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

  it('잘못된 저장 값을 거부한다', () => {
    assert.equal(parseStoredSessionToken('opaque-token', configuration), null);
    assert.equal(
      parseStoredSessionToken(
        JSON.stringify({
          apiOrigin: 1,
          clientId: configuration.clientId,
          issuer: configuration.issuer,
          token: 'opaque-token',
        }),
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

  it('빈 토큰을 직렬화하지 않는다', () => {
    assert.throws(() => serializeStoredSessionToken(configuration, '  '));
  });
});
