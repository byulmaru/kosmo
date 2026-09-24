import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentProps, ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as PaginationSurfaceModule from './PaginationSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ViewHost = 'View' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const SpinnerHost = 'ActivityIndicator' as unknown as ElementType;
const shown: Array<{ message: string; options: Record<string, unknown> }> = [];
let dismissed = 0;
const showToast = (message: string, options: Record<string, unknown>) => {
  shown.push({ message, options });
  return () => {
    dismissed += 1;
  };
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  ActivityIndicator: SpinnerHost,
  StyleSheet: { create: (styles: object) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast }) });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundSecondary: '#777' }),
});

let PaginationSurface: typeof PaginationSurfaceModule.PaginationSurface;
type Props = ComponentProps<typeof PaginationSurface>;

before(async () => {
  ({ PaginationSurface } = await import('./PaginationSurface'));
});
beforeEach(() => {
  shown.length = 0;
  dismissed = 0;
});

const props = (): Props => ({
  error: false,
  errorMessage: '다음 페이지 오류',
  hasNext: true,
  isLoading: false,
  loadingLabel: '더 불러오는 중',
  onRetry: () => undefined,
});

function render(value: Props) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(PaginationSurface, value));
  });
  assert.ok(renderer);
  return renderer;
}

test('shows only a labelled spinner during the next-page request', () => {
  const renderer = render({ ...props(), isLoading: true });
  assert.equal(renderer.root.findAllByType(SpinnerHost).length, 1);
  assert.equal(renderer.root.findByType(SpinnerHost).props.accessibilityLabel, '더 불러오는 중');
  assert.equal(renderer.root.findByType(TextHost).props.accessibilityLiveRegion, 'polite');
  assert.equal(shown.length, 0);
  act(() => renderer.unmount());
});

test('keeps retry toast until error clears, without an inline action', () => {
  let retries = 0;
  const value = { ...props(), error: true, onRetry: () => (retries += 1) };
  const renderer = render(value);
  assert.equal(renderer.root.findAllByType(SpinnerHost).length, 0);
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.message, '다음 페이지 오류');
  assert.equal(shown[0]?.options.persistent, true);
  const action = shown[0]?.options.action as { onPress: () => void };
  action.onPress();
  assert.equal(retries, 1);
  act(() => renderer.update(createElement(PaginationSurface, { ...value, error: false })));
  assert.equal(dismissed, 1);
  act(() => renderer.unmount());
});

test('does not show a retry toast without an available action', () => {
  const renderer = render({ ...props(), error: true, onRetry: undefined });
  assert.equal(shown.length, 0);
  act(() => renderer.unmount());
});
