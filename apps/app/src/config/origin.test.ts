import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getApiOrigin, getPublicWebOrigin } from './origin';

describe('네이티브 API origin', () => {
  it('release channel의 API origin을 사용한다', () => {
    assert.equal(getApiOrigin(), 'https://api.kos.moe');
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

  it('browser origin이 없을 때 Native release Web origin으로 fallback한다', () => {
    const restoreWindow = stubWindowLocation();

    try {
      assert.equal(getPublicWebOrigin(), 'https://kos.moe');
    } finally {
      restoreWindow();
    }
  });

  it('현재 browser의 HTTPS 또는 loopback origin을 정규화한다', () => {
    for (const [origin, expected] of [
      ['https://kosmo.example/', 'https://kosmo.example'],
      ['http://127.0.0.1:4173', 'http://127.0.0.1:4173'],
    ] as const) {
      const restoreWindow = stubWindowLocation({ origin });

      try {
        assert.equal(getPublicWebOrigin(), expected);
      } finally {
        restoreWindow();
      }
    }
  });

  it('path가 있거나 안전하지 않은 remote browser origin을 거부한다', () => {
    for (const origin of [
      'https://kosmo.example/app',
      'http://kosmo.example',
      'http://192.0.2.1:4173',
    ]) {
      const restoreWindow = stubWindowLocation({ origin });

      try {
        assert.throws(() => getPublicWebOrigin(), /Web origin/);
      } finally {
        restoreWindow();
      }
    }
  });
});

function stubWindowLocation(location?: { origin?: string }): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  if (location) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location },
    });
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }

  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  };
}
