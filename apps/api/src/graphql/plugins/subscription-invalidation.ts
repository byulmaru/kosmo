import { profilePubSub } from '@kosmo/core/profile/events';
import { sessionPubSub } from '@kosmo/core/session/events';
import { isAsyncIterable } from 'graphql-yoga';
import type { ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

const closeOnInvalidation = (
  source: AsyncIterable<ExecutionResult>,
  sessionId: string,
  profileId?: string,
): AsyncIterableIterator<ExecutionResult> => {
  const sourceIterator = source[Symbol.asyncIterator]();
  const signalIterators = [
    sessionPubSub.subscribe('sessionEnded', sessionId),
    ...(profileId ? [profilePubSub.subscribe('profileDisabled', profileId)] : []),
  ];
  let closed = false;
  let invalidated = false;
  let closing: Promise<void> | undefined;
  let resolveClosed!: (result: IteratorResult<ExecutionResult>) => void;
  const closedResult = new Promise<IteratorResult<ExecutionResult>>((resolve) => {
    resolveClosed = resolve;
  });

  const signalEnds = signalIterators.map((iterator) =>
    iterator.next().then(() => {
      invalidated = true;
      return { done: true, value: undefined } as const;
    }),
  );
  for (const signalEnd of signalEnds) {
    void signalEnd.catch(() => undefined);
  }

  const close = (): Promise<void> => {
    if (!closing) {
      closed = true;
      resolveClosed({ done: true, value: undefined });
      closing = Promise.allSettled([
        Promise.resolve().then(() => sourceIterator.return?.()),
        ...signalIterators.map((iterator) => Promise.resolve().then(() => iterator.return?.())),
      ]).then(() => undefined);
    }
    return closing;
  };

  return {
    async next(): Promise<IteratorResult<ExecutionResult>> {
      if (closed) {
        return { done: true, value: undefined };
      }

      try {
        const result = await Promise.race([sourceIterator.next(), ...signalEnds, closedResult]);
        if (closed || invalidated) {
          await close();
          return { done: true, value: undefined };
        }
        if (result.done) {
          await close();
        }
        return result;
      } catch (error) {
        await close();
        throw error;
      }
    },
    async return(value?: unknown): Promise<IteratorResult<ExecutionResult>> {
      await close();
      return { done: true, value };
    },
    async throw(error?: unknown): Promise<IteratorResult<ExecutionResult>> {
      await close();
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

export const useSubscriptionInvalidation = (): Plugin<UserContext> => ({
  onSubscribe: ({ context }) => {
    const session = context.session;
    if (!session) {
      return;
    }

    return {
      onSubscribeResult: ({ result, setResult }) => {
        if (isAsyncIterable(result)) {
          setResult(closeOnInvalidation(result, session.id, session.profile?.id));
        }
      },
    };
  },
});
