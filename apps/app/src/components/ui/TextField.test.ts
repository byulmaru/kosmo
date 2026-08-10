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

mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  TextInput: TextInputHost,
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundSurface: 'surface',
    borderDefault: 'border',
    feedbackDangerBase: 'danger',
    feedbackDangerBorder: 'danger-border',
    foregroundPrimary: 'foreground',
    foregroundSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
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
  assert.equal(input?.props.accessibilityHint, '표시 이름을 확인해 주세요.');
  assert.equal(error?.props.accessibilityLiveRegion, 'polite');
  await act(async () => renderer?.unmount());
});
