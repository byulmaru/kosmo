import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getApiOrigin, getPublicWebOrigin, normalizeApiOrigin, normalizeWebOrigin } from './origin';

process.env.EXPO_PUBLIC_API_ORIGIN = 'http://127.0.0.1:4200';
process.env.EXPO_PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:5173';

describe('네이티브 API origin', () => {
  it('설정된 API origin만 사용한다', () => {
    assert.equal(getApiOrigin(), 'http://127.0.0.1:4200');
  });

  it('HTTPS 또는 loopback origin을 정규화한다', () => {
    assert.equal(
      normalizeApiOrigin('https://api.kosmo.example/', false),
      'https://api.kosmo.example',
    );
    assert.equal(normalizeApiOrigin('http://127.0.0.1:4200', false), 'http://127.0.0.1:4200');
  });

  it('path가 있거나 안전하지 않은 remote origin을 기본으로 거부한다', () => {
    assert.throws(() => normalizeApiOrigin('https://api.kosmo.example/graphql', false));
    assert.throws(() => normalizeApiOrigin('http://api.kosmo.example', false));
  });
});

describe('public Web origin', () => {
  it('build-time 설정 대신 현재 browser origin을 사용한다', () => {
    const restoreWindow = stubWindowLocation({ origin: 'http://localhost:5173' });

    try {
      assert.equal(getPublicWebOrigin(), 'http://localhost:5173');
    } finally {
      restoreWindow();
    }
  });

  it('browser origin이 없을 때 설정된 Web origin으로 fallback한다', () => {
    const restoreWindow = stubWindowLocation({});
    const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://configured.example/';

    try {
      assert.equal(getPublicWebOrigin(), 'https://configured.example');
    } finally {
      process.env.EXPO_PUBLIC_WEB_ORIGIN = configured;
      restoreWindow();
    }
  });

  it('HTTPS 또는 loopback origin을 정규화한다', () => {
    assert.equal(normalizeWebOrigin('https://kosmo.example/', false), 'https://kosmo.example');
    assert.equal(normalizeWebOrigin('http://127.0.0.1:4173', false), 'http://127.0.0.1:4173');
  });

  it('path가 있거나 안전하지 않은 remote origin을 기본으로 거부한다', () => {
    assert.throws(() => normalizeWebOrigin('https://kosmo.example/app', false));
    assert.throws(() => normalizeWebOrigin('http://kosmo.example', false));
    assert.equal(normalizeWebOrigin('http://192.0.2.1:4173', true), 'http://192.0.2.1:4173');
  });

  it('browser 밖에서 origin 설정이 없으면 요청을 차단한다', () => {
    const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

    try {
      assert.throws(() => getPublicWebOrigin());
    } finally {
      process.env.EXPO_PUBLIC_WEB_ORIGIN = configured;
    }
  });
});

function stubWindowLocation(location: { origin?: string }): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location },
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  };
}
