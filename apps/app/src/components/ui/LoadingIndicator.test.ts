import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as LoadingIndicatorModule from './LoadingIndicator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ActivityIndicatorHost = 'ActivityIndicator' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
let reducedMotion = false;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  ActivityIndicator: ActivityIndicatorHost,
  Text: TextHost,
});
mockModule('@/theme/ThemeProvider', { useReducedMotion: () => reducedMotion });

let LoadingIndicator: typeof LoadingIndicatorModule.LoadingIndicator;

before(async () => {
  ({ LoadingIndicator } = await import('./LoadingIndicator'));
});

function renderWithLoadingText(loadingText: string | null) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(LoadingIndicator, {
        accessibilityLabel: '게시글을 불러오는 중',
        color: 'primary',
        loadingText,
        size: 'small',
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function render() {
  return renderWithLoadingText('게시글을 불러오는 중');
}

test('keeps the labelled platform indicator when reduced motion is off', () => {
  reducedMotion = false;
  const renderer = render();
  assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, 1);
  assert.equal(renderer.root.findAllByType(TextHost).length, 0);
  assert.equal(
    renderer.root.findByType(ActivityIndicatorHost).props.accessibilityLabel,
    '게시글을 불러오는 중',
  );
  assert.equal(renderer.root.findByType(ActivityIndicatorHost).props.size, 'small');
  act(() => renderer.unmount());
});

test('replaces rotation with static dots when reduced motion is on', () => {
  reducedMotion = true;
  const renderer = render();
  assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, 0);
  const fallback = renderer.root.findAllByType(TextHost)[0];
  assert.ok(fallback);
  assert.equal(fallback.children.join(''), '···');
  assert.equal(renderer.root.findAllByType(TextHost)[1]?.children.join(''), '게시글을 불러오는 중');
  assert.equal(fallback.props.accessible, false);
  assert.equal(fallback.props['aria-hidden'], true);
  act(() => renderer.unmount());
});

test('keeps a compact overlay label on the static dots without adding layout text', () => {
  reducedMotion = true;
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(LoadingIndicator, {
        accessibilityLabel: '첨부 이미지 업로드 중',
        color: 'primary',
        loadingText: null,
      }),
    );
  });
  assert.ok(renderer);
  const rendered = renderer;
  const fallback = rendered.root.findByType(TextHost);
  assert.equal(fallback.children.join(''), '···');
  assert.equal(fallback.props.accessibilityLabel, '첨부 이미지 업로드 중');
  assert.equal(fallback.props.accessible, true);
  assert.equal(fallback.props['aria-hidden'], undefined);
  assert.equal(rendered.root.findAllByType(TextHost).length, 1);
  act(() => rendered.unmount());
});
