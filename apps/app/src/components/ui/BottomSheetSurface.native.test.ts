import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, afterEach, before, mock, test } from 'node:test';
import { act, createElement } from 'react';
import type { ComponentType } from 'react';
import type { BottomSheetSurface as SheetComponent } from './BottomSheetSurface';

type Point = { x: number; y: number };
type HostProps = { style: unknown; onAccessibilityEscape?: () => void };
const harness = createRequire(import.meta.url)('../post/PostListItem.native.harness.cjs') as {
  nativeExports: Record<string, unknown> & { Pressable: ComponentType<Record<string, unknown>> };
  PanResponder: unknown;
  render(element: ReturnType<typeof createElement>): void;
  cleanup(): void;
  unmount(): void;
  touchStart(tag: number, point: Point): void;
  touchMove(point: Point): void;
  touchEnd(): void;
  touchCancel(): void;
  tagByTestID(id: string): number | undefined;
  tagByAccessibilityLabel(label: string): number | undefined;
  responderTag(): number | null;
  viewProps(tag: number): HostProps;
};
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-native', { ...harness.nativeExports, PanResponder: harness.PanResponder });
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ backgroundElevated: 'white', borderDefault: 'gray', borderStrong: 'black' }),
  useReducedMotion: () => true,
});

let Sheet: typeof SheetComponent;
let closes = 0;
let selections = 0;
before(async () => ({ BottomSheetSurface: Sheet } = await import('./BottomSheetSurface')));
afterEach(async () => {
  await act(async () => harness.unmount());
  closes = 0;
  selections = 0;
});
after(() => harness.cleanup());
const tag = (id: string) => {
  const result = harness.tagByTestID(id);
  assert.notEqual(result, undefined);
  return result!;
};
const sheetStyle = () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style ?? {}) as Record<string, unknown>);
  return flatten(harness.viewProps(tag('sheet')).style);
};
async function mount(initialHeight: number | undefined = 480, closeDisabled = false) {
  await act(async () => {
    harness.render(
      createElement(Sheet, {
        initialHeight,
        closeDisabled,
        handleTestID: 'handle',
        testID: 'sheet',
        onClose: () => {
          closes += 1;
        },
        children: createElement(harness.nativeExports.Pressable, {
          testID: 'emoji',
          onPress: () => {
            selections += 1;
          },
        }),
      }),
    );
  });
}
async function drag(x: number, dy: number, cancel = false, target = 'handle') {
  await act(async () => harness.touchStart(tag(target), { x, y: 300 }));
  await act(async () => harness.touchMove({ x, y: 300 + Math.sign(dy) * 10 }));
  await act(async () => harness.touchMove({ x, y: 300 + dy }));
  await act(async () => (cancel ? harness.touchCancel() : harness.touchEnd()));
}

// Native JS responder dispatch is real; device hit testing and layout require runtime QA.
for (const [position, x] of [
  ['left', 16],
  ['center', 195],
  ['right', 374],
] as const) {
  test(`${position}: native handle expands, collapses, cancels and dismisses`, async () => {
    await mount();
    await drag(x, -120);
    assert.equal(sheetStyle().height, 844);
    assert.equal(closes, 0);
    await drag(x, 120, true);
    assert.equal(sheetStyle().height, 844);
    await drag(x, 120);
    assert.equal(sheetStyle().height, 480);
    await drag(x, -30);
    assert.equal(sheetStyle().height, 480);
    await drag(x, 120, true);
    assert.equal(sheetStyle().height, 480);
    await drag(x, 120);
    assert.equal(closes, 1);
  });
}

test('content input does not become a handle gesture and selection still works', async () => {
  await mount();
  await drag(16, -120, false, 'emoji');
  assert.equal(sheetStyle().height, 480);
  assert.equal(closes, 0);
  await act(async () => harness.touchStart(tag('emoji'), { x: 20, y: 20 }));
  await act(async () => harness.touchEnd());
  assert.equal(selections, 1);
});

test('non-expandable sheet keeps its handle tap dismissal', async () => {
  // ActionMenu supplies no initialHeight.
  await act(async () =>
    harness.render(
      createElement(Sheet, {
        handleTestID: 'handle',
        onClose: () => {
          closes += 1;
        },
      }),
    ),
  );
  await act(async () => harness.touchStart(tag('handle'), { x: 20, y: 20 }));
  await act(async () => harness.touchEnd());
  assert.equal(closes, 1);
});

test('disabled sheet rejects handle tap and drag', async () => {
  await mount(480, true);
  await act(async () => harness.touchStart(tag('handle'), { x: 20, y: 20 }));
  await act(async () => harness.touchEnd());
  await drag(16, 120);
  assert.equal(sheetStyle().height, 480);
  assert.equal(closes, 0);
  assert.equal(harness.responderTag(), null);
});
