import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import SessionProviderQueryNode from '../session/__generated__/SessionProviderQuery.graphql';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { SessionProviderQuery as SessionProviderQueryType } from '../session/__generated__/SessionProviderQuery.graphql';
import type { RouteBoundaryHandle } from './RouteBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-crypto', { randomUUID });
mockModule(new URL('./ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});

type RouteBoundaryProps = {
  children: ReactNode;
  loading: ReactNode;
  title: string;
};
type Request = {
  fail: (error: Error) => void;
  respond: (data: Record<string, unknown>) => void;
};
type FetchPolicy = 'store-or-network' | 'store-and-network';

let RouteBoundary: ForwardRefExoticComponent<
  RouteBoundaryProps & RefAttributes<RouteBoundaryHandle>
>;
let useRouteBoundary: () => { fetchKey: string };
let renderer: ReactTestRenderer | null = null;
let observedFetchKey = '';
const requests: Request[] = [];

before(async () => {
  ({ RouteBoundary, useRouteBoundary } = await import('./RouteBoundary'));
});

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));

afterEach(async () => {
  await act(async () => renderer?.unmount());
  await act(async () => mock.timers.tick(300_001));
  mock.timers.reset();
  renderer = null;
  observedFetchKey = '';
  requests.length = 0;
});

function QueryProbe({ fetchPolicy }: { fetchPolicy: FetchPolicy }) {
  const { fetchKey } = useRouteBoundary();
  observedFetchKey = fetchKey;
  const data = ReactRelay.useLazyLoadQuery<SessionProviderQueryType>(
    SessionProviderQueryNode,
    {},
    { fetchKey, fetchPolicy },
  );
  return createElement('QueryResult', { name: data.me?.name });
}

function createEnvironment(store = new Store(new RecordSource())) {
  return new Environment({
    network: Network.create(() =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({
          fail: (error) => sink.error(error),
          respond: (data) => {
            sink.next({ data });
            sink.complete();
          },
        });
      }),
    ),
    store,
  });
}

function tree(environment: Environment, fetchPolicy: FetchPolicy = 'store-or-network') {
  return createElement(ReactRelay.RelayEnvironmentProvider, {
    environment,
    children: createElement(RouteBoundary, {
      children: createElement(QueryProbe, { fetchPolicy }),
      loading: null,
      title: 'query failed',
    }),
  });
}

async function mount(environment: Environment, fetchPolicy?: FetchPolicy) {
  await act(async () => {
    renderer = create(tree(environment, fetchPolicy));
  });
}

async function unmount() {
  await act(async () => renderer?.unmount());
  renderer = null;
}

function result() {
  assert.ok(renderer);
  return renderer.root.find((node) => String(node.type) === 'QueryResult');
}

function errorFallback(): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find((node) => String(node.type) === 'StateView');
}

function payload(name: string) {
  return {
    currentSession: { id: 'session-1', selectedProfile: { id: 'profile-1' } },
    me: { id: 'account-1', name },
  };
}

describe('RouteBoundary with real Relay query lifecycle', () => {
  it('keeps a retried result warm across repeated remounts after the original request failed', async () => {
    const environment = createEnvironment();
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await mount(environment);
      assert.equal(requests.length, 1, 'a cold store-or-network query fetches');

      await act(async () => requests[0]?.fail(new Error('initial request failed')));
      const failedFallback = errorFallback();
      assert.equal(requests.length, 1);

      await act(async () => failedFallback.props.onAction());
      assert.equal(requests.length, 2, 'retry starts a fresh request');

      await act(async () => requests[1]?.respond(payload('Recovered')));
      assert.equal(result().props.name, 'Recovered');

      for (let remount = 0; remount < 3; remount += 1) {
        await unmount();
        await mount(environment);
        assert.equal(result().props.name, 'Recovered');
        assert.equal(
          requests.length,
          2,
          'a warm store-or-network remount reuses normalized data without another request',
        );
      }
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('allows another retry after consecutive network failures', async () => {
    const environment = createEnvironment();
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await mount(environment);
      await act(async () => requests[0]?.fail(new Error('first request failed')));
      await act(async () => errorFallback().props.onAction());
      assert.equal(requests.length, 2);

      await act(async () => requests[1]?.fail(new Error('retry failed')));
      await act(async () => errorFallback().props.onAction());
      assert.equal(requests.length, 3);

      await act(async () => requests[2]?.respond(payload('Recovered after retries')));
      assert.equal(result().props.name, 'Recovered after retries');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('preserves a warm store-and-network refresh after a failed cold query and retry', async () => {
    const environment = createEnvironment();
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await mount(environment, 'store-and-network');
      assert.equal(requests.length, 1);
      await act(async () => requests[0]?.fail(new Error('initial request failed')));
      await act(async () => errorFallback().props.onAction());
      assert.equal(requests.length, 2, 'the retry starts another request');
      await act(async () => requests[1]?.respond(payload('Recovered')));
      assert.equal(result().props.name, 'Recovered');
      await unmount();

      await mount(environment, 'store-and-network');
      assert.equal(result().props.name, 'Recovered', 'warm data renders during the refresh');
      assert.equal(requests.length, 3, 'a fresh store-and-network mount refetches once');

      await act(async () => renderer?.update(tree(environment, 'store-and-network')));
      assert.equal(requests.length, 3, 'an ordinary rerender reuses the mounted query');
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('delivers a pending request late response to a remounted boundary', async () => {
    const environment = createEnvironment();
    const originalConsoleError = console.error;
    console.error = () => undefined;

    try {
      await mount(environment);
      assert.equal(requests.length, 1);
      const firstFetchKey = observedFetchKey;
      await unmount();

      await mount(environment);
      assert.notEqual(observedFetchKey, firstFetchKey);
      assert.equal(requests.length, 1, 'Relay reuses the identical pending operation');

      await act(async () => requests[0]?.respond(payload('Late response')));

      assert.equal(result().props.name, 'Late response');
      assert.equal(
        requests.length,
        1,
        'the late response completes the remounted query without another request',
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('releases the temporary store retention after an unmounted pending query expires', async () => {
    const environment = createEnvironment(
      new Store(new RecordSource(), {
        gcReleaseBufferSize: 0,
        gcScheduler: (run) => run(),
      }),
    );
    const operation = createOperationDescriptor(getRequest(SessionProviderQueryNode), {});

    await mount(environment);
    assert.equal(requests.length, 1);
    await unmount();

    await act(async () => requests[0]?.respond(payload('Temporarily retained')));
    assert.equal(environment.check(operation).status, 'available');

    await act(async () => mock.timers.tick(300_001));
    assert.equal(environment.check(operation).status, 'missing');
  });
});
