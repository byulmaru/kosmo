import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionPubSub } from '@kosmo/core/session/events';
import { useSessionEnded } from './session-ended';
import type { ExecutionResult } from 'graphql';

const getIterator = async (sessionId: string, source: AsyncIterable<ExecutionResult>) => {
  const hooks = await useSessionEnded().onSubscribe?.({
    context: { session: { id: sessionId } },
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

const createSessionSignal = () => {
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

test('ends session-bound subscription sources on the matching session signal', async (t) => {
  const sessionSignal = createSessionSignal();
  const subscribedSessions: string[] = [];
  t.mock.method(sessionPubSub, 'subscribe', (_topic: 'sessionEnded', sessionId: string) => {
    subscribedSessions.push(sessionId);
    return sessionSignal.iterator as never;
  });

  const event: ExecutionResult = { data: { value: 'post' } };
  let sourceReturnCount = 0;
  let sourceReadCount = 0;
  let resolvePendingRead!: (result: IteratorResult<ExecutionResult>) => void;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          sourceReadCount += 1;
          return sourceReadCount === 1
            ? Promise.resolve({ done: false, value: event })
            : new Promise((resolve) => (resolvePendingRead = resolve));
        },
        return: async () => {
          sourceReturnCount += 1;
          resolvePendingRead?.({ done: true, value: undefined });
          return { done: true, value: undefined };
        },
      };
    },
  };
  const iterator = await getIterator('session-1', source);

  assert.deepEqual(await iterator.next(), { done: false, value: event });
  const pendingRead = iterator.next();
  sessionSignal.end();

  assert.deepEqual(await pendingRead, { done: true, value: undefined });
  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
  assert.deepEqual(subscribedSessions, ['session-1']);
  assert.equal(sourceReturnCount, 1);
  assert.equal(sessionSignal.returnCount(), 1);
});

test('cleans up both iterators when a caller returns while a source read is pending', async (t) => {
  const sessionSignal = createSessionSignal();
  t.mock.method(sessionPubSub, 'subscribe', () => sessionSignal.iterator as never);

  let sourceReturnCount = 0;
  let resolvePendingRead!: (result: IteratorResult<ExecutionResult>) => void;
  const source: AsyncIterable<ExecutionResult> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise((resolve) => (resolvePendingRead = resolve)),
        return: async () => {
          sourceReturnCount += 1;
          resolvePendingRead?.({ done: true, value: undefined });
          return { done: true, value: undefined };
        },
      };
    },
  };
  const iterator = await getIterator('session-1', source);
  const pendingRead = iterator.next();

  assert.deepEqual(await iterator.return?.(), { done: true, value: undefined });
  assert.deepEqual(await pendingRead, { done: true, value: undefined });
  assert.equal(sourceReturnCount, 1);
  assert.equal(sessionSignal.returnCount(), 1);
});

test('cleans up both iterators and preserves a source failure', async (t) => {
  const sessionSignal = createSessionSignal();
  t.mock.method(sessionPubSub, 'subscribe', () => sessionSignal.iterator as never);

  const failure = new Error('Subscription source failed');
  let sourceReturnCount = 0;
  const source: AsyncIterable<ExecutionResult> = {
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
  const iterator = await getIterator('session-1', source);

  await assert.rejects(iterator.next(), failure);
  assert.equal(sourceReturnCount, 1);
  assert.equal(sessionSignal.returnCount(), 1);
});
