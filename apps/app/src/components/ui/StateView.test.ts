import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as StateViewModule from './StateView';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
const ButtonHost = 'Button' as unknown as ElementType;

mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => ({
    feedbackDangerOnSubtle: 'danger-on-subtle',
    feedbackDangerSubtle: 'danger-subtle',
    foregroundPrimary: 'foreground',
    foregroundSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  radius: { 8: 8, 12: 12 },
  space: { 8: 8, 32: 32 },
  textStyles: { uiCopyM: {}, uiLabelL: {} },
});
mockModule('./Button', { Button: ButtonHost });

let stateViewModule: typeof StateViewModule | undefined;

before(async () => {
  stateViewModule = await import('./StateView');
});

test('alert StateView consumes the danger subtle foreground pair', async () => {
  assert.ok(stateViewModule);
  const { StateView } = stateViewModule;
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(StateView, {
        actionLabel: '다시 시도',
        alert: true,
        description: '잠시 후 다시 시도해 주세요.',
        onAction: () => undefined,
        title: '불러오지 못했어요',
      }),
    );
  });

  const root = renderer?.root.findByType(ViewHost);
  const text = renderer?.root.findAllByType(TextHost) ?? [];
  assert.equal(root?.props.style[1].backgroundColor, 'danger-subtle');
  assert.equal(text[0]?.props.style[1].color, 'danger-on-subtle');
  assert.equal(text[1]?.props.style[1].color, 'danger-on-subtle');
  assert.equal(renderer?.root.findByType(ButtonHost).props.tone, undefined);
  await act(async () => renderer?.unmount());
});
