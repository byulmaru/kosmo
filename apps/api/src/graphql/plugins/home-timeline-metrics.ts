import { isAsyncIterable } from 'graphql-yoga';
import { recordHomeTimelineOutcome } from '@/metrics';
import type { ExecutionResult } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import type { UserContext } from '@/context';
import type { HomeTimelineOutcome } from '@/metrics';

const homeTimelineResponseKeys = new WeakMap<object, Set<string>>();

export const trackHomeTimelineRequest = (
  context: UserContext,
  responseKey: string | number,
): void => {
  if (typeof responseKey !== 'string') {
    return;
  }

  const keys = homeTimelineResponseKeys.get(context) ?? new Set<string>();
  keys.add(responseKey);
  homeTimelineResponseKeys.set(context, keys);
};

const takeHomeTimelineResponseKeys = (context: UserContext): Set<string> | undefined => {
  const keys = homeTimelineResponseKeys.get(context);
  if (!keys) {
    return undefined;
  }

  homeTimelineResponseKeys.delete(context);
  return keys;
};

const classifyResult = (
  result: ExecutionResult,
  responseKeys: Set<string>,
): HomeTimelineOutcome | undefined => {
  const erroredResponseKeys = new Set<string>();
  let failed = false;

  for (const error of result.errors ?? []) {
    const responseKey = error.path?.[0];
    if (typeof responseKey === 'string' && responseKeys.has(responseKey)) {
      erroredResponseKeys.add(responseKey);
      failed ||= error.extensions.code === 'INTERNAL_SERVER_ERROR';
    }
  }

  if (failed) {
    return 'server_error';
  }

  if (result.data) {
    for (const responseKey of responseKeys) {
      if (!erroredResponseKeys.has(responseKey) && result.data[responseKey] != null) {
        return 'success';
      }
    }
  }

  return undefined;
};

export const useHomeTimelineMetrics = (): Plugin<UserContext> => ({
  onExecute: ({ args }) => ({
    onExecuteDone: ({ result }) => {
      const responseKeys = takeHomeTimelineResponseKeys(args.contextValue);
      if (!responseKeys) {
        return;
      }
      if (isAsyncIterable(result)) {
        return;
      }

      const outcome = classifyResult(result, responseKeys);
      if (outcome) {
        recordHomeTimelineOutcome(outcome);
      }
    },
  }),
});
