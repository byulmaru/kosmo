import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyClientError, isExpectedClientError, StructuredClientError } from './client-error';

describe('클라이언트 오류 분류', () => {
  it('구조화된 transport 오류를 예상 오류로 분류한다', () => {
    const error = new StructuredClientError({
      code: 'NETWORK_REQUEST_FAILED',
      message: 'network down',
      origin: 'transport',
      type: 'network',
    });

    assert.deepEqual(classifyClientError(error), {
      code: 'NETWORK_REQUEST_FAILED',
      origin: 'transport',
      type: 'network',
    });
    assert.equal(isExpectedClientError(error), true);
  });

  it('Relay source의 GraphQL 오류를 message와 무관하게 예상 오류로 분류한다', () => {
    const error = Object.assign(new Error('민감한 서버 오류 원문'), {
      name: 'RelayNetwork',
      source: {
        errors: [{ extensions: { code: 'INTERNAL_SERVER_ERROR' }, message: '원문' }],
        operation: {},
      },
    });

    assert.deepEqual(classifyClientError(error), {
      code: 'INTERNAL_SERVER_ERROR',
      origin: 'graphql-response',
      type: 'graphql',
    });
    assert.equal(isExpectedClientError(error), true);
  });

  it('구조화되지 않은 local render 오류만 예상하지 못한 오류로 분류한다', () => {
    const error = new Error('private stack and path');

    assert.deepEqual(classifyClientError(error), {
      code: 'UNEXPECTED_RENDER_ERROR',
      origin: 'local-render',
      type: 'render',
    });
    assert.equal(isExpectedClientError(error), false);
  });
});
