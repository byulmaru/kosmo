import { sessionPubSub } from '@kosmo/core/session/events';
import { isAsyncIterable } from 'graphql-yoga';
import type { ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

const closeOnSessionEnd = (
  source: AsyncIterable<ExecutionResult>,
  sessionId: string,
): AsyncIterableIterator<ExecutionResult> => {
  const sourceIterator = source[Symbol.asyncIterator]();
  const sessionIterator = sessionPubSub.subscribe('sessionEnded', sessionId);
  let closed = false;
  let sessionEnded = false;
  let closing: Promise<void> | undefined;

  const sessionEnd = sessionIterator.next().then(() => {
    sessionEnded = true;
    return { done: true, value: undefined } as const;
  });
  void sessionEnd.catch(() => undefined);

  const close = (): Promise<void> => {
    if (!closing) {
      closed = true;
      closing = Promise.allSettled([
        Promise.resolve().then(() => sourceIterator.return?.()),
        Promise.resolve().then(() => sessionIterator.return?.()),
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
        const result = await Promise.race([sourceIterator.next(), sessionEnd]);
        if (closed || sessionEnded) {
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

export const useSessionEnded = (): Plugin<UserContext> => ({
  onSubscribe: ({ context }) => {
    const sessionId = context.session?.id;
    if (!sessionId) {
      return;
    }

    return {
      onSubscribeResult: ({ result, setResult }) => {
        if (isAsyncIterable(result)) {
          setResult(closeOnSessionEnd(result, sessionId));
        }
      },
    };
  },
});
