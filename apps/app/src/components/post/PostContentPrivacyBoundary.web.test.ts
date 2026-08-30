import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('react-native', {
  exports: { View: 'View' },
} as unknown as Parameters<typeof mock.module>[1]);

let PostContentPrivacyBoundary: ComponentType<{
  children?: ReactNode;
  style: Record<string, unknown>;
}>;

before(async () => {
  ({ PostContentPrivacyBoundary } = await import('./PostContentPrivacyBoundary.web'));
});

describe('PostContentPrivacyBoundary Web', () => {
  it('실제 DOM ancestor에 Replay masking과 autocapture 제외 class를 함께 둔다', async () => {
    let renderer: ReturnType<typeof create> | undefined;
    await act(async () => {
      renderer = create(
        createElement(
          PostContentPrivacyBoundary,
          { style: { gap: 8 } },
          createElement('Text', null, 'private content'),
        ),
      );
    });

    const boundary = renderer?.root.findByType('div');
    assert.equal(boundary?.props.className, 'ph-mask ph-no-capture');
    assert.equal(boundary?.props['data-testid'], 'post-content-renderer');
    assert.deepEqual(boundary?.props.style, { display: 'contents' });
    assert.deepEqual(boundary?.findByType('View' as unknown as ComponentType).props.style, {
      gap: 8,
    });

    await act(async () => renderer?.unmount());
  });
});
