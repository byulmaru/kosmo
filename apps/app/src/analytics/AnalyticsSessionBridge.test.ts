import assert from 'node:assert/strict';
import { after, afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { AnalyticsSessionBridge } from './AnalyticsSessionBridge';
import type { SearchProfileEventArgs } from './events';
import type { searchProfileJourneys } from './searchProfileJourneys';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const events: SearchProfileEventArgs[] = [];
const identities: string[] = [];
const session = {
  accountId: 'account-a' as string | null,
  selectedProfileId: 'profile-a' as string | null,
  status: 'valid',
};
let pathname = '/search';
let listener: ((id: string) => void) | undefined;
let renderer: ReactTestRenderer | undefined;
const page = new EventTarget();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { configurable: true, value: page });
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('expo-router', { usePathname: () => pathname });
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule(new URL('../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
});
mockModule(new URL('./client.ts', import.meta.url), {
  clearAnalytics: () => identities.push('clear'),
  identifyAnalytics: (id: string) => identities.push(id),
  observeAnalyticsSession: (callback: (id: string) => void) => {
    listener = callback;
    callback('session-a');
    return () => {
      listener = undefined;
    };
  },
  captureSearchProfileAnalytics: (args: SearchProfileEventArgs) => {
    events.push(args);
    return 'session-a';
  },
});
let Bridge: typeof AnalyticsSessionBridge;
let journeys: typeof searchProfileJourneys;
before(async () => {
  ({ AnalyticsSessionBridge: Bridge } = await import('./AnalyticsSessionBridge'));
  ({ searchProfileJourneys: journeys } = await import('./searchProfileJourneys'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  events.length = 0;
  identities.length = 0;
  session.accountId = 'account-a';
  session.selectedProfileId = 'profile-a';
  session.status = 'valid';
  pathname = '/search';
});

afterEach(() => {
  journeys.end();
});

test('실제 effect에서 identity·actor·SDK session·pagehide 종료를 연결한다', async () => {
  await act(async () => {
    renderer = create(createElement(Bridge));
  });
  assert.deepEqual(identities, ['account-a']);
  for (const boundary of ['profile', 'account', 'auth', 'sdk', 'pagehide']) {
    journeys.setSearch(boundary);
    const journey = journeys.select(boundary, 'target', '/@target');
    if (boundary === 'profile') {
      session.selectedProfileId = 'profile-b';
    }
    if (boundary === 'account') {
      session.accountId = 'account-b';
    }
    if (boundary === 'auth') {
      session.status = 'guest';
      session.accountId = null;
    }
    if (boundary === 'sdk') {
      listener?.('session-b');
    }
    if (boundary === 'pagehide') {
      page.dispatchEvent(new Event('pagehide'));
    }
    await act(async () => renderer!.update(createElement(Bridge)));
    journeys.succeed(journey, 'target', 'follow');
  }
  assert.equal(events.length, 5);
  assert.equal(
    events.every(([event]) => event === 'search_profile_journey_started'),
    true,
  );
  assert.deepEqual(identities, ['account-a', 'account-b', 'clear']);
});

test('다른 route로 이동하면 선택을 분리하고 unmount 후 SDK 구독을 해제한다', async () => {
  await act(async () => {
    renderer = create(createElement(Bridge));
  });
  journeys.setSearch('route');
  journeys.select('route', 'target', '/@target');
  pathname = '/@target';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.ok(journeys.forRoute('/@target', 'target'));
  pathname = '/home';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.equal(journeys.forRoute('/@target', 'target'), null);
  await act(async () => renderer!.unmount());
  assert.equal(listener, undefined);
});

after(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
