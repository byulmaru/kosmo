import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '@kosmo/core/db';
import { profilePubSub } from '@kosmo/core/profile/events';
import { sessionPubSub } from '@kosmo/core/session/events';
import { useSubscriptionInvalidation } from './subscription-invalidation';
import type { TestContext } from 'node:test';
import type { ExecutionResult } from 'graphql';

type SessionRows = readonly { readonly id: string }[];

const installSessionCheck = (
  t: TestContext,
  read: () => Promise<SessionRows> = () => Promise.resolve([{ id: 'session-1' }]),
) => {
  t.mock.method(db, 'select', () => {
    const query = {
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => read() }),
        }),
      }),
    };
    return query as never;
  });
};

const getIterator = async (
  sessionId: string,
  source: AsyncIterable<ExecutionResult>,
  profileId?: string,
) => {
  const hooks = await useSubscriptionInvalidation().onSubscribe?.({
    context: {
      session: {
        id: sessionId,
        accountId: 'account-1',
        profile: profileId === undefined ? null : { id: profileId },
      },
    },
  } as never);
  assert.ok(hooks && 'onSubscribeResult' in hooks);

  let result: ExecutionResult | AsyncIterable<ExecutionResult> = source;
  await hooks.onSubscribeResult?.({
    args: {} as never,
    result,
    setResult: (next: ExecutionResult | AsyncIterable<ExecutionResult>) => {
      result = next;
    },
  } as never);
  assert.ok(Symbol.asyncIterator in result);
  return result[Symbol.asyncIterator]();
};

const createSignal = () => {
  let resolveNext!: (result: IteratorResult<true>) => void;
  let returnCount = 0;
  const iterator: AsyncIterableIterator<true> = {
    next: () => new Promise((resolve) => (resolveNext = resolve)),
    return: async () => {
      returnCount += 1;
      resolveNext?.({ done: true, value: undefined });
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return {
    iterator,
    end: () => resolveNext({ done: false, value: true }),
    returnCount: () => returnCount,
  };
};

const createPendingSource = () => {
  const queuedResults: IteratorResult<ExecutionResult>[] = [];
  const waitingReaders: ((result: IteratorResult<ExecutionResult>) => void)[] = [];
  let returnCount = 0;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          const queuedResult = queuedResults.shift();
          return queuedResult
            ? Promise.resolve(queuedResult)
            : new Promise((resolve) => waitingReaders.push(resolve));
        },
        return: async () => {
          returnCount += 1;
          for (const resolve of waitingReaders.splice(0)) {
            resolve({ done: true, value: undefined });
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
  return {
    source,
    emit: (value: ExecutionResult) => {
      const result = { done: false, value } as const;
      const resolve = waitingReaders.shift();
      if (resolve) {
        resolve(result);
      } else {
        queuedResults.push(result);
      }
    },
    returnCount: () => returnCount,
  };
};

test('closes all subscriptions for the disabled Profile across Sessions and leaves another Profile running', async (t) => {
  installSessionCheck(t);
  const sessionSignals = new Map<string, ReturnType<typeof createSignal>[]>();
  const profileSignals = new Map<string, ReturnType<typeof createSignal>[]>();
  const subscribedProfiles: string[] = [];
  t.mock.method(sessionPubSub, 'subscribe', (_topic: 'sessionEnded', sessionId: string) => {
    const signal = createSignal();
    sessionSignals.set(sessionId, [...(sessionSignals.get(sessionId) ?? []), signal]);
    return signal.iterator as never;
  });
  t.mock.method(profilePubSub, 'subscribe', (_topic: 'profileDisabled', profileId: string) => {
    subscribedProfiles.push(profileId);
    const signal = createSignal();
    profileSignals.set(profileId, [...(profileSignals.get(profileId) ?? []), signal]);
    return signal.iterator as never;
  });

  const profileASourceOne = createPendingSource();
  const profileASourceTwo = createPendingSource();
  const profileBSource = createPendingSource();
  const profileAOne = await getIterator('session-1', profileASourceOne.source, 'profile-A');
  const profileATwo = await getIterator('session-2', profileASourceTwo.source, 'profile-A');
  const profileB = await getIterator('session-1', profileBSource.source, 'profile-B');
  const pendingReads = [profileAOne.next(), profileATwo.next()];

  for (const signal of profileSignals.get('profile-A') ?? []) {
    signal.end();
  }

  assert.deepEqual(await Promise.all(pendingReads), [
    { done: true, value: undefined },
    { done: true, value: undefined },
  ]);
  assert.deepEqual(subscribedProfiles, ['profile-A', 'profile-A', 'profile-B']);
  assert.equal(profileASourceOne.returnCount(), 1);
  assert.equal(profileASourceTwo.returnCount(), 1);
  assert.equal(sessionSignals.get('session-1')?.[0]?.returnCount(), 1);
  assert.equal(sessionSignals.get('session-2')?.[0]?.returnCount(), 1);
  assert.equal(
    profileSignals.get('profile-A')?.every((signal) => signal.returnCount() === 1),
    true,
  );

  const marker: ExecutionResult = { data: { profile: 'B' } };
  const profileBRead = profileB.next();
  profileBSource.emit(marker);
  assert.deepEqual(await profileBRead, { done: false, value: marker });
  await profileB.return?.();
  assert.equal(profileSignals.get('profile-B')?.[0]?.returnCount(), 1);
});

test('session-only subscriptions do not subscribe to Profile signals', async (t) => {
  installSessionCheck(t);
  const sessionSignal = createSignal();
  t.mock.method(profilePubSub, 'subscribe', () => {
    assert.fail('A Session-only subscription must not subscribe to a Profile signal');
  });
  t.mock.method(sessionPubSub, 'subscribe', (_topic: 'sessionEnded', sessionId: string) => {
    assert.equal(sessionId, 'session-1');
    return sessionSignal.iterator as never;
  });

  const source = createPendingSource();
  const iterator = await getIterator('session-1', source.source);
  const pendingRead = iterator.next();
  sessionSignal.end();

  assert.deepEqual(await pendingRead, { done: true, value: undefined });
  assert.equal(source.returnCount(), 1);
  assert.equal(sessionSignal.returnCount(), 1);
});

test('caller return settles pending reads and cleans up the source and all signals', async (t) => {
  installSessionCheck(t);
  const sessionSignal = createSignal();
  const profileSignal = createSignal();
  t.mock.method(sessionPubSub, 'subscribe', () => sessionSignal.iterator as never);
  t.mock.method(profilePubSub, 'subscribe', () => profileSignal.iterator as never);

  const source = createPendingSource();
  const iterator = await getIterator('session-1', source.source, 'profile-1');
  const pendingRead = iterator.next();

  assert.deepEqual(await iterator.return?.(), { done: true, value: undefined });
  assert.deepEqual(await pendingRead, { done: true, value: undefined });
  assert.equal(source.returnCount(), 1);
  assert.equal(sessionSignal.returnCount(), 1);
  assert.equal(profileSignal.returnCount(), 1);
});

test('cleans up all iterators when the source completes or fails', async (t) => {
  installSessionCheck(t);
  const sessionSignals = [createSignal(), createSignal()];
  const profileSignals = [createSignal(), createSignal()];
  let sessionIndex = 0;
  let profileIndex = 0;
  t.mock.method(
    sessionPubSub,
    'subscribe',
    () => sessionSignals[sessionIndex++]!.iterator as never,
  );
  t.mock.method(
    profilePubSub,
    'subscribe',
    () => profileSignals[profileIndex++]!.iterator as never,
  );

  let sourceReturnCount = 0;
  const completeSource: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: true, value: undefined }),
        return: async () => {
          sourceReturnCount += 1;
          return { done: true, value: undefined };
        },
      };
    },
  };
  const completed = await getIterator('session-1', completeSource, 'profile-1');
  assert.deepEqual(await completed.next(), { done: true, value: undefined });
  assert.equal(sourceReturnCount, 1);
  assert.equal(sessionSignals[0]?.returnCount(), 1);
  assert.equal(profileSignals[0]?.returnCount(), 1);

  const failure = new Error('Subscription source failed');
  const failedSource: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(failure),
        return: async () => {
          sourceReturnCount += 1;
          return { done: true, value: undefined };
        },
      };
    },
  };
  const failed = await getIterator('session-2', failedSource, 'profile-2');
  await assert.rejects(failed.next(), failure);
  assert.equal(sourceReturnCount, 2);
  assert.equal(sessionSignals[1]?.returnCount(), 1);
  assert.equal(profileSignals[1]?.returnCount(), 1);
});

test('caller throw cleans up all iterators and preserves the error', async (t) => {
  installSessionCheck(t);
  const sessionSignal = createSignal();
  const profileSignal = createSignal();
  t.mock.method(sessionPubSub, 'subscribe', () => sessionSignal.iterator as never);
  t.mock.method(profilePubSub, 'subscribe', () => profileSignal.iterator as never);

  const source = createPendingSource();
  const iterator = await getIterator('session-1', source.source, 'profile-1');
  const failure = new Error('Subscription consumer failed');

  assert.ok(iterator.throw);
  await assert.rejects(iterator.throw(failure), failure);
  assert.equal(source.returnCount(), 1);
  assert.equal(sessionSignal.returnCount(), 1);
  assert.equal(profileSignal.returnCount(), 1);
});

test('completes without a source event when the startup Session check fails', async (t) => {
  installSessionCheck(t, () => Promise.resolve([]));
  t.mock.method(sessionPubSub, 'subscribe', () => createSignal().iterator as never);
  t.mock.method(profilePubSub, 'subscribe', () => createSignal().iterator as never);

  const marker: ExecutionResult = { data: { post: 'must not be delivered' } };
  let emitted = false;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (emitted) {
            return { done: true, value: undefined };
          }
          emitted = true;
          return { done: false, value: marker };
        },
      };
    },
  };
  const iterator = await getIterator('session-1', source);

  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
});

test('keeps streaming after the startup Session check when later reads would be inactive', async (t) => {
  let active = true;
  installSessionCheck(t, () => {
    const rows = active ? [{ id: 'session-1' }] : [];
    active = false;
    return Promise.resolve(rows);
  });
  t.mock.method(sessionPubSub, 'subscribe', () => createSignal().iterator as never);
  t.mock.method(profilePubSub, 'subscribe', () => createSignal().iterator as never);

  const markers: ExecutionResult[] = [{ data: { post: 'first' } }, { data: { post: 'second' } }];
  let nextMarker = 0;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: false, value: markers[nextMarker++]! }),
      };
    },
  };
  const iterator = await getIterator('session-1', source);

  assert.deepEqual(await iterator.next(), { done: false, value: markers[0] });
  assert.deepEqual(await iterator.next(), { done: false, value: markers[1] });
  await iterator.return?.();
});

test('a pending startup check cannot start the source after caller return or invalidation', async (t) => {
  const startupChecks: {
    resolve: (rows: SessionRows) => void;
    promise: Promise<SessionRows>;
  }[] = [];
  installSessionCheck(t, () => {
    let resolve!: (rows: SessionRows) => void;
    const promise = new Promise<SessionRows>((complete) => (resolve = complete));
    startupChecks.push({ resolve, promise });
    return promise;
  });
  const sessionSignals = new Map<string, ReturnType<typeof createSignal>>();
  t.mock.method(sessionPubSub, 'subscribe', (_topic: 'sessionEnded', sessionId: string) => {
    const signal = createSignal();
    sessionSignals.set(sessionId, signal);
    return signal.iterator as never;
  });
  t.mock.method(profilePubSub, 'subscribe', () => {
    assert.fail('A Session-only subscription must not subscribe to a Profile signal');
  });

  const createUnconsumedSource = () => {
    let started = false;
    const source: AsyncIterable<ExecutionResult> = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            started = true;
            return { done: false, value: { data: { post: 'must not be consumed' } } };
          },
        };
      },
    };
    return { source, wasStarted: () => started };
  };

  const returnedSource = createUnconsumedSource();
  const returned = await getIterator('session-returned', returnedSource.source);
  const returnedRead = returned.next();
  await returned.return?.();
  assert.deepEqual(await returnedRead, { done: true, value: undefined });
  const returnedStartupCheck = startupChecks[0]!;
  returnedStartupCheck.resolve([{ id: 'session-returned' }]);
  await returnedStartupCheck.promise;
  assert.equal(returnedSource.wasStarted(), false);

  const invalidatedSource = createUnconsumedSource();
  const invalidated = await getIterator('session-invalidated', invalidatedSource.source);
  const invalidatedRead = invalidated.next();
  sessionSignals.get('session-invalidated')!.end();
  assert.deepEqual(await invalidatedRead, { done: true, value: undefined });
  const invalidatedStartupCheck = startupChecks[1]!;
  invalidatedStartupCheck.resolve([{ id: 'session-invalidated' }]);
  await invalidatedStartupCheck.promise;
  assert.equal(invalidatedSource.wasStarted(), false);
});

test('preserves a startup Session check error and cleans up all iterators', async (t) => {
  const failure = new Error('Session startup check failed');
  installSessionCheck(t, () => Promise.reject(failure));
  const sessionSignal = createSignal();
  const profileSignal = createSignal();
  t.mock.method(sessionPubSub, 'subscribe', () => sessionSignal.iterator as never);
  t.mock.method(profilePubSub, 'subscribe', () => profileSignal.iterator as never);

  const source = createPendingSource();
  const iterator = await getIterator('session-1', source.source, 'profile-1');

  await assert.rejects(iterator.next(), failure);
  assert.equal(source.returnCount(), 1);
  assert.equal(sessionSignal.returnCount(), 1);
  assert.equal(profileSignal.returnCount(), 1);
});
