import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { AnalyticsPageviewBridge as AnalyticsPageviewBridgeType } from './AnalyticsPageviewBridge';

const calls: string[] = [];
let segments: string[] = [];
const routeRef = { current: null as string | null };

mock.module('react', {
  exports: {
    useEffect: (effect: () => void) => effect(),
    useRef: () => routeRef,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('expo-router', {
  exports: {
    useSegments: () => segments,
  },
} as unknown as Parameters<typeof mock.module>[1]);
const clientMock = {
  exports: {
    trackAnalytics: (event: string, properties: { route_template?: string }) => {
      if (event === '$pageview' && properties.route_template) {
        calls.push(properties.route_template);
      }
    },
  },
};
mock.module(
  new URL('./client.ts', import.meta.url),
  clientMock as unknown as Parameters<typeof mock.module>[1],
);
mock.module(
  new URL('./client.web.ts', import.meta.url),
  clientMock as unknown as Parameters<typeof mock.module>[1],
);

let AnalyticsPageviewBridge: typeof AnalyticsPageviewBridgeType;

before(async () => {
  ({ AnalyticsPageviewBridge } = await import('./AnalyticsPageviewBridge'));
});

beforeEach(() => {
  calls.length = 0;
  segments = [];
  routeRef.current = null;
});

describe('AnalyticsPageviewBridge', () => {
  it('최초 route template과 template 전환만 capture한다', () => {
    AnalyticsPageviewBridge();
    segments = ['(tabs)', 'privacy'];
    AnalyticsPageviewBridge();
    segments = ['(tabs)', 'privacy'];
    AnalyticsPageviewBridge();
    segments = ['(tabs)', '(profile)', '[profileHandle]'];
    AnalyticsPageviewBridge();

    assert.deepEqual(calls, ['/', '/privacy', '/[profileHandle]']);
  });

  it('same dynamic route template의 re-render는 dedupe한다', () => {
    segments = ['(tabs)', '(profile)', '[profileHandle]'];
    AnalyticsPageviewBridge();
    AnalyticsPageviewBridge();
    segments = ['(tabs)', '(profile)', '[profileHandle]'];
    AnalyticsPageviewBridge();

    assert.deepEqual(calls, ['/[profileHandle]']);
  });
});
