import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { semanticColors } from '../../theme/tokens';
import type { ElementType } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const host = 'Pressable' as unknown as ElementType;
const platform = { OS: 'web' };
const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('react-native', {
  Platform: platform,
  Pressable: host,
  StyleSheet: { create: <T>(styles: T) => styles, flatten },
  View: 'View',
});
mockModule('lucide-react-native', { MoreHorizontal: 'MoreHorizontal' });
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), {
  MoreHorizontal: 'MoreHorizontal',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => semanticColors.light,
  useReducedMotion: () => true,
});

test('profile more keeps a 40px visual with full Native targets and independent focus/disabled states', async () => {
  const { ProfileMoreButton } = await import('./ProfileMoreButton');
  const onPress = mock.fn();
  for (const [os, target] of [
    ['web', 40],
    ['ios', 44],
    ['android', 48],
  ] as const) {
    platform.OS = os;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        createElement(ProfileMoreButton, { disabled: false, expanded: false, onPress }),
      );
    });
    const control = () => renderer.root.findByType(host);
    const visual = (state: object) => control().props.children(state);
    assert.equal(flatten(control().props.style({ pressed: false })).width, target);
    assert.equal(flatten(control().props.style({ pressed: false })).height, target);
    assert.equal(flatten(visual({ pressed: false }).props.style).width, 40);
    assert.equal(flatten(visual({ pressed: false }).props.style).height, 40);
    assert.equal(
      flatten(visual({ hovered: true }).props.style).backgroundColor,
      semanticColors.light.stateHover,
    );
    assert.equal(
      flatten(visual({ pressed: true, hovered: true }).props.style).backgroundColor,
      semanticColors.light.statePressed,
    );
    if (os === 'web') {
      await act(async () => control().props.onFocus({ currentTarget: { matches: () => true } }));
      const focused = flatten(visual({ hovered: true }).props.style);
      assert.equal(focused.outlineWidth, 2);
      assert.equal(focused.outlineOffset, 2);
      assert.equal(focused.outlineStyle, 'solid');
      assert.equal(focused.backgroundColor, semanticColors.light.stateHover);
      assert.equal(focused.transitionDuration, '0ms');
    }
    await act(async () =>
      renderer.update(
        createElement(ProfileMoreButton, { disabled: true, expanded: false, onPress }),
      ),
    );
    assert.equal(control().props.disabled, true);
    assert.equal(control().props.accessibilityState.disabled, true);
    const disabled = visual({ pressed: true, hovered: true });
    assert.equal(
      flatten(disabled.props.style).backgroundColor,
      semanticColors.light.stateDisabledSurface,
    );
    assert.equal(disabled.props.children.props.color, semanticColors.light.stateDisabledForeground);
    if (os === 'web') {
      assert.equal(flatten(disabled.props.style).outlineStyle, 'none');
    }
    await act(async () => renderer.unmount());
  }
});
