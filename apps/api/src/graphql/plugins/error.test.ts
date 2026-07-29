import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSchema, execute, GraphQLError, parse } from 'graphql';
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
});
