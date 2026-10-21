import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  NotificationReadAllAction as NotificationReadAllActionComponent,
  NotificationReadAllProvider as NotificationReadAllProviderComponent,
  useNotificationReadAll as UseNotificationReadAll,
} from './NotificationReadAllContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationResponse = {
  markNotificationRead: {
    notifications: ReadonlyArray<{ id: string; readAt: string | null }>;
  } | null;
} | null;

type MutationConfig = {
  onCompleted: (response: MutationResponse, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: { ids: ReadonlyArray<string> };
};

const generationRef = { current: 1 };
const mutationConfigs: MutationConfig[] = [];
const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
const toastCalls: Array<[string, Record<string, unknown>]> = [];
let NotificationReadAllAction: typeof NotificationReadAllActionComponent;
let NotificationReadAllProvider: typeof NotificationReadAllProviderComponent;
let useNotificationReadAll: typeof UseNotificationReadAll;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', { Platform: { OS: 'web' } });
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => [
    (config: MutationConfig) => {
      mutationConfigs.push(config);
    },
    false,
  ],
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/components/ui/Button', {
  Button: (props: Record<string, unknown>) =>
    createElement('Button', props, props.children as string),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (message: string, options: Record<string, unknown>) => {
      toastCalls.push([message, options]);
    },
  }),
});
mockModule('@/relay/RelayActorProvider', { useRelayActorLifecycleKey: () => 'actor-a' });
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});

function ReadAllHarness({ ids }: { ids: ReadonlyArray<string> }) {
  const { publishUnreadIds } = useNotificationReadAll();
  useEffect(() => publishUnreadIds(ids), [ids, publishUnreadIds]);
  return createElement(NotificationReadAllAction);
}

before(async () => {
  ({ NotificationReadAllAction, NotificationReadAllProvider, useNotificationReadAll } =
    await import('./NotificationReadAllContext'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mutationConfigs.length = 0;
  analyticsCalls.length = 0;
  toastCalls.length = 0;
  generationRef.current = 1;
});

async function renderReadAll(ids: ReadonlyArray<string>) {
  await act(async () => {
    renderer = create(
      createElement(NotificationReadAllProvider, null, createElement(ReadAllHarness, { ids })),
    );
  });
  const button = renderer?.root.findByType('Button' as ElementType);
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  return button;
}

describe('Notification read-all analytics', () => {
  it('records all when every requested notification is confirmed read', async () => {
    const button = await renderReadAll(['notification-1', 'notification-2']);
    await act(async () => button.props.onPress());
    assert.deepEqual(mutationConfigs[0]?.variables, {
      ids: ['notification-1', 'notification-2'],
    });

    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [
            { id: 'notification-1', readAt: '2026-10-21T00:01:00.000Z' },
            { id: 'notification-2', readAt: '2026-10-21T00:01:00.000Z' },
          ],
        },
      }),
    );

    assert.deepEqual(analyticsCalls, [['notifications_read', { scope: 'all' }]]);
    assert.equal(toastCalls.length, 0);
  });

  it('suppresses all when the response is partial or missing', async () => {
    const button = await renderReadAll(['notification-1', 'notification-2']);
    await act(async () => button.props.onPress());
    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [{ id: 'notification-1', readAt: '2026-10-21T00:01:00.000Z' }],
        },
      }),
    );
    assert.deepEqual(analyticsCalls, []);
    assert.equal(toastCalls.length, 0);

    await act(async () => button.props.onPress());
    await act(async () => mutationConfigs[1]?.onCompleted({ markNotificationRead: null }));
    assert.deepEqual(analyticsCalls, []);
    assert.equal(toastCalls.length, 1);
  });

  it('suppresses all after the environment generation changes', async () => {
    const button = await renderReadAll(['notification-1']);
    await act(async () => button.props.onPress());
    generationRef.current += 1;
    await act(async () =>
      mutationConfigs[0]?.onCompleted({
        markNotificationRead: {
          notifications: [{ id: 'notification-1', readAt: '2026-10-21T00:01:00.000Z' }],
        },
      }),
    );

    assert.deepEqual(analyticsCalls, []);
    assert.equal(toastCalls.length, 0);
  });
});
