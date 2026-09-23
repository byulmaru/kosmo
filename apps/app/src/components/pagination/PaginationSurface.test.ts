import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentProps, ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as PaginationSurfaceModule from './PaginationSurface';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ViewHost = 'View' as unknown as ElementType;
const ButtonHost = 'Button' as unknown as ElementType;

mockModule('react-native', { View: ViewHost });
mockModule('@/components/ui/Button', { Button: ButtonHost });

let PaginationSurface: typeof PaginationSurfaceModule.PaginationSurface;
type PaginationSurfaceProps = ComponentProps<typeof PaginationSurface>;

before(async () => {
  ({ PaginationSurface } = await import('./PaginationSurface'));
});

function render(props: PaginationSurfaceProps) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(PaginationSurface, props));
  });
  assert.ok(renderer);
  return renderer;
}

test('hides the action when there is no next page or load error', () => {
  const renderer = render({
    hasNext: false,
    loadMoreLabel: '더 불러오기',
    loadingLabel: '불러오는 중',
    onLoadMore: () => undefined,
    retryLabel: '다시 시도',
  });
  assert.equal(renderer.root.findAllByType(ViewHost).length, 0);
  assert.equal(renderer.root.findAllByType(ButtonHost).length, 0);
  act(() => renderer.unmount());
});

test('blocks duplicate load-more actions while exposing busy and disabled state', () => {
  let loadCount = 0;
  const renderer = render({
    hasNext: true,
    isLoading: true,
    loadMoreLabel: '더 불러오기',
    loadingLabel: '불러오는 중',
    onLoadMore: () => {
      loadCount += 1;
    },
    retryLabel: '다시 시도',
  });
  const button = renderer.root.findByType(ButtonHost);
  assert.equal(button.props.accessibilityState.busy, true);
  assert.equal(button.props.accessibilityState.disabled, true);
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.equal(loadCount, 0);
  act(() => renderer.unmount());
});

test('preserves error content and routes retry to the retry action', () => {
  let retryCount = 0;
  const renderer = render({
    children: createElement('ErrorCopy'),
    error: true,
    hasNext: false,
    loadMoreLabel: '더 불러오기',
    loadingLabel: '불러오는 중',
    onRetry: () => {
      retryCount += 1;
    },
    retryLabel: '다시 시도',
  });
  assert.equal(renderer.root.findAllByType('ErrorCopy' as unknown as ElementType).length, 1);
  const button = renderer.root.findByType(ButtonHost);
  assert.equal(button.props.children, '다시 시도');
  button.props.onPress();
  assert.equal(retryCount, 1);
  act(() => renderer.unmount());
});

test('keeps error content when retry is unavailable', () => {
  const renderer = render({
    children: createElement('ErrorCopy'),
    error: true,
    hasNext: false,
    loadMoreLabel: '더 불러오기',
    loadingLabel: '불러오는 중',
    retryLabel: '다시 시도',
  });
  assert.equal(renderer.root.findAllByType('ErrorCopy' as unknown as ElementType).length, 1);
  assert.equal(renderer.root.findAllByType(ButtonHost).length, 0);
  act(() => renderer.unmount());
});
