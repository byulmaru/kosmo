import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import type { ReactElement } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ accent: '#123456' }),
});

type UnreadDotProps = {
  style?: object;
  testID?: string;
};
type UnreadDotElement = ReactElement<{
  'aria-hidden'?: boolean;
  accessibilityElementsHidden?: boolean;
  accessible?: boolean;
  importantForAccessibility?: string;
  style?: unknown;
  testID?: string;
}>;
type UnreadDotComponent = (props: UnreadDotProps) => UnreadDotElement;

let UnreadDot: UnreadDotComponent | undefined;

before(async () => {
  const module = await import('./UnreadDot').catch(() => null);
  UnreadDot = module?.UnreadDot as UnreadDotComponent | undefined;
});

test('unread dot은 공통 의미 스타일과 접근성 숨김을 소유한다', () => {
  assert.ok(UnreadDot, 'UnreadDot component must exist');
  const callerStyle = { height: 12, position: 'absolute', right: -2, top: -2, width: 12 };
  const dot = UnreadDot({ style: callerStyle, testID: 'profile-switcher-unread-dot' });

  assert.equal(dot.type, 'View');
  assert.equal(dot.props.accessible, false);
  assert.equal(dot.props.accessibilityElementsHidden, true);
  assert.equal(dot.props['aria-hidden'], true);
  assert.equal(dot.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(dot.props.testID, 'profile-switcher-unread-dot');
  assert.deepEqual(dot.props.style, [
    { borderRadius: 999 },
    { backgroundColor: '#123456' },
    callerStyle,
  ]);
});
