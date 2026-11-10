import { Accounts, db, Sessions, withPrimaryDatabase } from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import { profilePubSub } from '@kosmo/core/profile/events';
import { sessionPubSub } from '@kosmo/core/session/events';
import { and, eq } from 'drizzle-orm';
import { isAsyncIterable } from 'graphql-yoga';
import type { ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';

const closeOnInvalidation = (
  source: AsyncIterable<ExecutionResult>,
  sessionId: string,
  accountId: string,
  profileId?: string,
): AsyncIterableIterator<ExecutionResult> => {
  const sourceIterator = source[Symbol.asyncIterator]();
  const signalIterators = [
    sessionPubSub.subscribe('sessionEnded', sessionId),
    ...(profileId ? [profilePubSub.subscribe('profileDisabled', profileId)] : []),
  ];
  let closed = false;
  let closing: Promise<void> | undefined;
  let cancelActiveRead: (() => void) | undefined;
  let terminalFailure: { error: unknown } | undefined;

  let startupCheck: Promise<boolean> | undefined;
  const isSessionActive = () => {
    startupCheck ??= withPrimaryDatabase(() =>
      db
        .select({ id: Sessions.id })
        .from(Sessions)
        .innerJoin(Accounts, eq(Sessions.accountId, Accounts.id))
        .where(
          and(
            eq(Sessions.id, sessionId),
            eq(Sessions.accountId, accountId),
            eq(Sessions.state, SessionState.ACTIVE),
            eq(Accounts.state, AccountState.ACTIVE),
          ),
        )
        .limit(1)
        .then((rows) => rows.length > 0),
    );
    return startupCheck;
  };

  const close = (failure?: { error: unknown }): Promise<void> => {
    if (!closing) {
      closed = true;
      terminalFailure = failure;
      const cancelRead = cancelActiveRead;
      cancelActiveRead = undefined;
      cancelRead?.();
      closing = Promise.allSettled([
        Promise.resolve().then(() => sourceIterator.return?.()),
        ...signalIterators.map((iterator) => Promise.resolve().then(() => iterator.return?.())),
      ]).then(() => undefined);
    }
    return closing;
  };

  for (const iterator of signalIterators) {
    void iterator
      .next()
      .then(
        () => {
          void close();
        },
        (error: unknown) => {
          void close({ error });
        },
      )
      .catch(() => undefined);
  }

  const throwTerminalFailure = () => {
    const failure = terminalFailure;
    terminalFailure = undefined;
    if (failure) {
      throw failure.error;
    }
  };

  return {
    async next(): Promise<IteratorResult<ExecutionResult>> {
      if (closed) {
        await close();
        throwTerminalFailure();
        return { done: true, value: undefined };
      }

      let cancelRead!: () => void;
      const readCancelled = new Promise<void>((resolve) => {
        cancelRead = () => resolve();
      });
      cancelActiveRead = cancelRead;

      try {
        const sessionActive = await Promise.race([isSessionActive(), readCancelled]);
        if (closed || sessionActive === undefined) {
          await close();
          throwTerminalFailure();
          return { done: true, value: undefined };
        }
        if (sessionActive !== true) {
          await close();
          return { done: true, value: undefined };
        }

        const result = await Promise.race([sourceIterator.next(), readCancelled]);
        if (closed || result === undefined) {
          await close();
          throwTerminalFailure();
          return { done: true, value: undefined };
        }
        if (result.done) {
          await close();
        }
        return result;
      } catch (error) {
        terminalFailure = undefined;
        await close();
        throw error;
      } finally {
        if (cancelActiveRead === cancelRead) {
          cancelActiveRead = undefined;
        }
      }
    },
    async return(value?: unknown): Promise<IteratorResult<ExecutionResult>> {
      terminalFailure = undefined;
      await close();
      return { done: true, value };
    },
    async throw(error?: unknown): Promise<IteratorResult<ExecutionResult>> {
      terminalFailure = undefined;
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
          setResult(
            closeOnInvalidation(result, session.id, session.accountId, session.profile?.id),
          );
        }
      },
    };
  },
});
