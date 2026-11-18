import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactElement } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const host = 'Pressable' as unknown as ElementType;
const pressState = { hovered: false, pressed: false };
const PressableHost = ({
  children,
  ...props
}: {
  children?: ReactElement | ((state: typeof pressState) => ReactElement);
  [key: string]: unknown;
}) => createElement(host, props, typeof children === 'function' ? children(pressState) : children);

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Platform: { OS: 'web' },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles, flatten: (style: unknown) => style },
  View: 'View',
});
mockModule('lucide-react-native', { MoreHorizontal: 'MoreHorizontal' });
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), {
  MoreHorizontal: 'MoreHorizontal',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    borderDefault: '#ddd',
    foregroundPrimary: '#111',
    stateFocusRing: '#005fcc',
    stateHover: '#eee',
    statePressed: '#ddd',
    stateDisabledForeground: '#666',
    stateDisabledSurface: '#eee',
  }),
  useReducedMotion: () => true,
});
mockModule('@/components/ui/useAnimatedColorTransition', {
  useAnimatedColorTransition: ({ color }: { color: string }) => color,
});

test('profile more exposes menu state and activates the button', async () => {
  const { ProfileMoreButton } = await import('./ProfileMoreButton');
  const onPress = mock.fn();
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(ProfileMoreButton, { disabled: false, expanded: false, onPress }),
    );
  });

  const button = () => renderer.root.findByType(PressableHost);
  assert.equal(button().props.accessibilityRole, 'button');
  assert.equal(button().props.accessibilityLabel, '더보기');
  assert.equal(button().props['aria-haspopup'], 'menu');
  assert.equal(button().props['aria-expanded'], false);
  assert.deepEqual(button().props.accessibilityState, {
    busy: false,
    disabled: false,
    expanded: false,
  });

  await act(async () => button().props.onPress());
  assert.equal(onPress.mock.callCount(), 1);

  await act(async () => {
    renderer.update(createElement(ProfileMoreButton, { disabled: true, expanded: true, onPress }));
  });

  assert.equal(button().props['aria-expanded'], true);
  assert.deepEqual(button().props.accessibilityState, {
    busy: true,
    disabled: true,
    expanded: true,
  });
  await act(async () => renderer.unmount());
});
