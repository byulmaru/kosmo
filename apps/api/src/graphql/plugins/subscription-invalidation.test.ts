import assert from 'node:assert/strict';
import test from 'node:test';
import { profilePubSub } from '@kosmo/core/profile/events';
import { sessionPubSub } from '@kosmo/core/session/events';
import { useSubscriptionInvalidation } from './subscription-invalidation';
import type { ExecutionResult } from 'graphql';

const getIterator = async (
  sessionId: string,
  source: AsyncIterable<ExecutionResult>,
  profileId?: string,
) => {
  const hooks = await useSubscriptionInvalidation().onSubscribe?.({
    context: {
      session: {
        id: sessionId,
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
  let resolveNext!: (result: IteratorResult<ExecutionResult>) => void;
  let returnCount = 0;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise((resolve) => (resolveNext = resolve)),
        return: async () => {
          returnCount += 1;
          return { done: true, value: undefined };
        },
      };
    },
  };
  return {
    source,
    emit: (value: ExecutionResult) => resolveNext({ done: false, value }),
    returnCount: () => returnCount,
  };
};

test('closes all subscriptions for the disabled Profile across Sessions and leaves another Profile running', async (t) => {
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
