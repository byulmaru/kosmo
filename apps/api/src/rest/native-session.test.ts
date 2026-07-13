import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nativeSession } from './native-session';

const requestNativeSession = (body: unknown) =>
  nativeSession.request('https://api.kosmo.example/login/native/session', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });

describe('native session exchange input boundary', () => {
  it('rejects raw OIDC token input before an OIDC exchange', async () => {
    const response = await requestNativeSession({
      accessToken: 'upstream-access-token',
      idToken: 'upstream.id.token',
      redirectUri: 'kosmo://login/callback',
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('pragma'), 'no-cache');
  });

  it('rejects an invalid redirect URI before an OIDC exchange', async () => {
    const response = await requestNativeSession({
      code: 'authorization-code',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'https://evil.example/login/callback',
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('rejects a malformed PKCE verifier before an OIDC exchange', async () => {
    const response = await requestNativeSession({
      code: 'authorization-code',
      codeVerifier: 'too-short',
      redirectUri: 'kosmo://login/callback',
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('limits native session payloads to 16 KiB', async () => {
    const response = await requestNativeSession({
      code: 'authorization-code',
      codeVerifier: 'v'.repeat(43),
      padding: 'x'.repeat(16 * 1024),
      redirectUri: 'kosmo://login/callback',
    });

    assert.equal(response.status, 413);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('pragma'), 'no-cache');
  });
});
