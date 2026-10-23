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

function render(props: Parameters<typeof LoadingIndicatorModule.LoadingIndicator>[0]) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(LoadingIndicator, props));
  });
  assert.ok(renderer);
  return renderer;
}

test('keeps the labelled platform indicator when reduced motion is off', () => {
  reducedMotion = false;
  const renderer = render({
    accessibilityLabel: '게시글을 불러오는 중',
    color: 'primary',
    size: 'small',
  });
  try {
    assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, 1);
    assert.equal(renderer.root.findAllByType(TextHost).length, 0);
    assert.equal(
      renderer.root.findByType(ActivityIndicatorHost).props.accessibilityLabel,
      '게시글을 불러오는 중',
    );
    assert.equal(renderer.root.findByType(ActivityIndicatorHost).props.color, 'primary');
    assert.equal(renderer.root.findByType(ActivityIndicatorHost).props.size, 'small');
  } finally {
    act(() => renderer.unmount());
  }
});

test('uses accessible static dots instead of a spinner when reduced motion is on', () => {
  reducedMotion = true;
  const renderer = render({
    accessibilityLabel: '게시글을 불러오는 중',
    color: 'primary',
    size: 'small',
  });
  try {
    assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, 0);
    const dots = renderer.root.findByType(TextHost);
    assert.equal(dots.children.join(''), '···');
    assert.equal(dots.props.accessibilityLabel, '게시글을 불러오는 중');
    assert.equal(dots.props.accessible, true);
    assert.equal(dots.props['aria-hidden'], undefined);
    assert.equal(renderer.root.findAllByType(TextHost).length, 1);
  } finally {
    act(() => renderer.unmount());
  }
});

test('keeps hidden static dots hidden when the caller hides the indicator', () => {
  reducedMotion = true;
  const renderer = render({
    accessibilityLabel: '답글 처리 중',
    accessible: false,
    'aria-hidden': true,
  });
  try {
    const dots = renderer.root.findByType(TextHost);
    assert.equal(dots.children.join(''), '···');
    assert.equal(dots.props.accessibilityLabel, '답글 처리 중');
    assert.equal(dots.props.accessible, false);
    assert.equal(dots.props['aria-hidden'], true);
  } finally {
    act(() => renderer.unmount());
  }
});
