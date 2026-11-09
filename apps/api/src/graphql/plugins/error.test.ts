import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PermissionDeniedError, ValidationError } from '@kosmo/core/error';
import { buildSchema, execute, GraphQLError, parse, subscribe } from 'graphql';
import { isAsyncIterable } from 'graphql-yoga';
import { useError } from './error';
import type { ExecutionResult } from 'graphql';

const schema = buildSchema('type Query { value: String! }');
const document = parse('{ value }');

const transform = async (result: ExecutionResult): Promise<ExecutionResult> => {
  const hooks = await useError().onExecute?.({} as never);
  assert.ok(hooks && typeof hooks === 'object' && 'onExecuteDone' in hooks);

  let transformed = result;
  await hooks.onExecuteDone?.({
    result,
    setResult: (next: ExecutionResult) => {
      transformed = next;
    },
  } as never);
  return transformed;
};

const subscriptionSchema = buildSchema(`
  type Query { unused: Boolean }
  type Subscription { value: String! }
`);
const subscriptionDocument = parse('subscription { value }');

const transformSubscription = async (
  result: ExecutionResult | AsyncIterable<ExecutionResult>,
): Promise<ExecutionResult> => {
  const hooks = await useError().onSubscribe?.({} as never);
  assert.ok(hooks && typeof hooks === 'object' && 'onSubscribeResult' in hooks);

  let transformed = result;
  const resultHooks = await hooks.onSubscribeResult?.({
    args: {} as never,
    result,
    setResult: (next: ExecutionResult | AsyncIterable<ExecutionResult>) => {
      transformed = next;
    },
  } as never);

  if (isAsyncIterable(transformed)) {
    assert.ok(resultHooks && 'onNext' in resultHooks);
    const iterator = transformed[Symbol.asyncIterator]();
    try {
      const next = await iterator.next();
      assert.equal(next.done, false);
      let eventResult = next.value;
      await resultHooks.onNext?.({
        args: {} as never,
        result: eventResult,
        setResult: (nextResult: ExecutionResult) => {
          eventResult = nextResult;
        },
      } as never);
      return eventResult;
    } finally {
      await iterator.return?.();
    }
  }

  return transformed;
};

const executeValue = (value: () => unknown) => execute({ document, rootValue: { value }, schema });

describe('GraphQL error collection', () => {
  it('preserves an intentionally thrown GraphQLError', async () => {
    const result = await executeValue(() => {
      throw new GraphQLError('Expected error', { extensions: { code: 'EXPECTED' } });
    });
    const transformed = await transform(result);

    assert.equal(transformed.errors?.[0], result.errors?.[0]);
    assert.equal(transformed.errors?.[0]?.extensions.code, 'EXPECTED');
  });

  it('transforms unexpected resolver and non-null execution errors', async () => {
    const thrown = await transform(
      await executeValue(() => {
        throw new Error('Unexpected resolver failure');
      }),
    );
    const nonNull = await transform(await executeValue(() => null));

    for (const result of [thrown, nonNull]) {
      assert.equal(result.errors?.[0]?.extensions.code, 'INTERNAL_SERVER_ERROR');
    }
  });

  it('does not expose private validation properties in the public error shape', async () => {
    const error = Object.assign(new ValidationError('Safe policy message', { field: 'handle' }), {
      reason: 'PROFILE_HANDLE_POLICY',
    });
    const transformed = await transform(await executeValue(() => Promise.reject(error)));

    assert.deepEqual(transformed.errors?.[0]?.extensions, {
      code: 'VALIDATION',
      field: 'handle',
    });
  });

  it('transforms authorization errors returned by subscription setup and event execution', async () => {
    const setupError = new PermissionDeniedError('Subscription denied');
    const deniedSubscription = await subscribe({
      schema: subscriptionSchema,
      document: subscriptionDocument,
      subscribeFieldResolver: () => {
        throw setupError;
      },
    });
    const transformedSetup = await transformSubscription(deniedSubscription);

    assert.equal(transformedSetup.errors?.[0]?.message, 'Subscription denied');
    assert.equal(transformedSetup.errors?.[0]?.extensions.code, 'PERMISSION_DENIED');

    const eventSubscription = await subscribe({
      schema: subscriptionSchema,
      document: subscriptionDocument,
      subscribeFieldResolver: () =>
        (async function* () {
          yield {
            value: () => {
              throw new PermissionDeniedError('Subscription event denied');
            },
          };
        })(),
    });
    const transformedEvent = await transformSubscription(eventSubscription);

    assert.equal(transformedEvent.errors?.[0]?.message, 'Subscription event denied');
    assert.equal(transformedEvent.errors?.[0]?.extensions.code, 'PERMISSION_DENIED');
  });
});
