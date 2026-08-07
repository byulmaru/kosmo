import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back' | 'canGoBack' | 'replace'>;

let returnToSettingsRoot: (router: SettingsNavigationRouter) => void;

before(async () => {
  ({ returnToSettingsRoot } = await import('./settingsNavigation'));
});

describe('Settings detail back navigation', () => {
  it('unrelated history가 있어도 Settings root를 명시적으로 연다', () => {
    let backCalls = 0;
    const replaced: string[] = [];

    returnToSettingsRoot({
      back: () => (backCalls += 1),
      canGoBack: () => true,
      replace: (href) => replaced.push(String(href)),
    });

    assert.equal(backCalls, 0);
    assert.deepEqual(replaced, ['/settings']);
  });

  it('direct detail entry에 이전 history가 없으면 Settings root로 대체한다', () => {
    let backCalls = 0;
    const replaced: string[] = [];

    returnToSettingsRoot({
      back: () => (backCalls += 1),
      canGoBack: () => false,
      replace: (href) => replaced.push(String(href)),
    });

    assert.equal(backCalls, 0);
    assert.deepEqual(replaced, ['/settings']);
  });
});
