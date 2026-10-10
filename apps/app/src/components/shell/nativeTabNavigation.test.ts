import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createNativeTabReselectionRegistry,
  findTabStackToPopTarget,
  handleNativeTabPress,
  hasSelectedProfileRoute,
} from './nativeTabNavigation';

test('a mounted nested route temporarily takes precedence and cleanup restores the root handler', () => {
  const registry = createNativeTabReselectionRegistry();
  const calls: string[] = [];
  const unregisterRoot = registry.register('profile', () => calls.push('root'));
  const unregisterDetail = registry.register('profile', () => calls.push('detail'));

  registry.reselect('profile');
  unregisterDetail();
  registry.reselect('profile');
  unregisterRoot();
  registry.reselect('profile');

  assert.deepEqual(calls, ['detail', 'root']);
});

test('inactive tab selection keeps its existing stack and changes the selected tab', () => {
  const calls: string[] = [];

  handleNativeTabPress({
    focused: false,
    stackIndex: 2,
    emitTabPress: () => {
      calls.push('emit');
      return false;
    },
    navigateToTab: () => calls.push('navigate'),
    onReselect: () => calls.push('reselect'),
    popToTop: () => calls.push('pop'),
    requestNavigation: () => false,
  });

  assert.deepEqual(calls, ['emit', 'navigate']);
});

test('reselecting an active tab from a detail screen only returns to its root', () => {
  const calls: string[] = [];

  handleNativeTabPress({
    focused: true,
    stackIndex: 1,
    emitTabPress: () => {
      calls.push('emit');
      return false;
    },
    navigateToTab: () => calls.push('navigate'),
    onReselect: () => calls.push('reselect'),
    popToTop: () => calls.push('pop'),
    requestNavigation: (action) => {
      action();
      return true;
    },
  });

  assert.deepEqual(calls, ['pop']);
});

test('reselecting an active tab at its root emits one reselect without navigating', () => {
  const calls: string[] = [];

  handleNativeTabPress({
    focused: true,
    stackIndex: 0,
    emitTabPress: () => {
      calls.push('emit');
      return false;
    },
    navigateToTab: () => calls.push('navigate'),
    onReselect: () => calls.push('reselect'),
    popToTop: () => calls.push('pop'),
    requestNavigation: () => {
      calls.push('guard');
      return true;
    },
  });

  assert.deepEqual(calls, ['emit', 'reselect']);
});

test('a navigation guard can defer tab switches and detail-stack pops', () => {
  for (const focused of [false, true]) {
    const calls: string[] = [];

    handleNativeTabPress({
      focused,
      stackIndex: 1,
      emitTabPress: () => {
        calls.push('emit');
        return false;
      },
      navigateToTab: () => calls.push('navigate'),
      onReselect: () => calls.push('reselect'),
      popToTop: () => calls.push('pop'),
      requestNavigation: () => true,
    });

    assert.deepEqual(calls, []);
  }
});

test('a detail opened above the tab root pops the tab stack even when it contains a nested stack', () => {
  const state = {
    index: 1,
    key: 'home-stack',
    routes: [
      { name: 'home' },
      {
        name: '(profile)',
        state: {
          index: 1,
          key: 'profile-stack',
          routes: [{ name: '[profileHandle]' }, { name: 'followers' }],
          type: 'stack',
        },
      },
    ],
    type: 'stack',
  } as const;

  assert.equal(findTabStackToPopTarget(state), 'home-stack');
});

test('a nested profile detail pops its profile stack when the tab root is the profile', () => {
  const state = {
    index: 0,
    key: 'account-stack',
    routes: [
      {
        name: '[profileHandle]',
        state: {
          index: 1,
          key: 'profile-detail-stack',
          routes: [{ name: 'index' }, { name: 'followers' }],
          type: 'stack',
        },
      },
    ],
    type: 'stack',
  } as const;

  assert.equal(findTabStackToPopTarget(state), 'profile-detail-stack');
});

test('profile route lookup finds the selected profile inside a nested tab stack', () => {
  const state = {
    index: 0,
    routes: [
      {
        name: '(home)',
        state: {
          index: 1,
          routes: [
            { name: 'home' },
            {
              name: '[profileHandle]',
              params: { profileHandle: '@me' },
            },
          ],
        },
      },
    ],
  } as const;

  assert.equal(hasSelectedProfileRoute(state, '@me'), true);
  assert.equal(hasSelectedProfileRoute(state, '@someone-else'), false);
});
