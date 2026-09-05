import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as TextFieldModule from './TextField';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TextHost = 'Text' as unknown as ElementType;
const TextInputHost = 'TextInput' as unknown as ElementType;
let platformOS: 'android' | 'ios' | 'web' = 'web';

mockModule('react-native', {
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  TextInput: TextInputHost,
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundSurface: 'surface',
    borderDefault: 'border',
    borderFocus: 'focus-border',
    feedbackDangerBorder: 'danger-border',
    feedbackDangerOnSubtle: 'danger-on-subtle',
    foregroundPrimary: 'foreground',
    foregroundMuted: 'muted',
    stateFocusRing: 'focus-ring',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1, 2: 2 },
  layoutRecipes: { labelSupportStack: { flexDirection: 'column', gap: 4 } },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12 },
  textStyles: {
    contentM: {},
    uiCopyL: {},
    uiCopyS: {},
    uiLabelM: {},
  },
});

let textFieldModule: typeof TextFieldModule | undefined;

before(async () => {
  textFieldModule = await import('./TextField');
});

test('error TextField exposes and associates its validation message', async () => {
  assert.ok(textFieldModule);
  const { TextField } = textFieldModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(TextField, {
        error: '표시 이름을 확인해 주세요.',
        label: '표시 이름',
      }),
    );
  });

  const input = renderer?.root.findByType(TextInputHost);
  const error = renderer?.root
    .findAllByType(TextHost)
    .find((node) => node.props.children === '표시 이름을 확인해 주세요.');
  assert.equal(input?.props['aria-invalid'], true);
  assert.equal(input?.props['aria-describedby'], error?.props.nativeID);
  assert.equal(input?.props.accessibilityHint, undefined);
  assert.equal(input?.props.placeholderTextColor, 'muted');
  assert.equal(error?.props.accessibilityLiveRegion, 'polite');
  assert.equal(error?.props.style[1].color, 'danger-on-subtle');
  await act(async () => renderer?.unmount());
});

test('focused TextField keeps the default inner border and semantic focus ring on every platform', async () => {
  assert.ok(textFieldModule);
  const { TextField } = textFieldModule;
  for (const platform of ['web', 'ios', 'android'] as const) {
    platformOS = platform;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(createElement(TextField, { label: '표시 이름' }));
    });

    const input = renderer?.root.findByType(TextInputHost);
    await act(async () => input?.props.onFocus({}));
    const focusedInput = renderer?.root.findByType(TextInputHost);
    assert.ok(focusedInput);
    const style = Object.assign({}, ...focusedInput.props.style.flat().filter(Boolean));
    assert.equal(style.borderColor, 'border', platform);
    assert.equal(style.borderWidth, 2, platform);
    assert.equal(style.outlineColor, 'focus-ring', platform);
    assert.equal(style.outlineOffset, 2, platform);
    assert.equal(style.outlineStyle, 'solid', platform);
    assert.equal(style.outlineWidth, 2, platform);
    await act(async () => renderer?.unmount());
  }
});

test('focused error TextField uses a danger ring without changing the inner border on every platform', async () => {
  assert.ok(textFieldModule);
  const { TextField } = textFieldModule;
  for (const platform of ['web', 'ios', 'android'] as const) {
    platformOS = platform;
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        createElement(TextField, {
          error: '표시 이름을 확인해 주세요.',
          label: '표시 이름',
        }),
      );
    });

    const input = renderer?.root.findByType(TextInputHost);
    await act(async () => input?.props.onFocus({}));
    const focusedInput = renderer?.root.findByType(TextInputHost);
    assert.ok(focusedInput);
    const style = Object.assign({}, ...focusedInput.props.style.flat().filter(Boolean));
    assert.equal(style.borderColor, 'border', platform);
    assert.equal(style.borderWidth, 2, platform);
    assert.equal(style.outlineColor, 'danger-border', platform);
    assert.notEqual(style.outlineColor, 'focus-ring', platform);
    assert.equal(style.outlineOffset, 2, platform);
    assert.equal(style.outlineStyle, 'solid', platform);
    assert.equal(style.outlineWidth, 2, platform);
    await act(async () => renderer?.unmount());
  }
});
