import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FormOverlay as FormOverlayExport, FormOverlayState } from './FormOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const require = createRequire(import.meta.url);
mockModule('lucide-react-native', { XIcon: 'XIcon' });
mockModule(require.resolve('lucide-react-native'), { XIcon: 'XIcon' });
mockModule('react-native', {
  Modal: (props: object) => createElement('Modal', props),
  Platform: { OS: 'ios' },
  ScrollView: (props: object) => createElement('ScrollView', props),
  StyleSheet: { create: (styles: object) => styles },
  Text: (props: object) => createElement('Text', props),
  useWindowDimensions: () => ({ height: 900, width: 800 }),
  View: (props: object) => createElement('View', props),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({
    backgroundElevated: '#fff',
    borderDefault: '#ddd',
    card: '#fff',
    foregroundSecondary: '#666',
    overlayScrim: '#0008',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule(new URL('../../theme/tokens.ts', import.meta.url), {
  breakpoints: { compact: 768 },
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { dialogActions: {} },
  radii: { full: 999, lg: 16 },
  space: { 12: 12 },
  spacing: { lg: 16, md: 12, sm: 8, xl: 24 },
  textStyles: { uiCopyM: {} },
  typography: { lg: {}, sm: {} },
});
mockModule(new URL('./Button.tsx', import.meta.url), {
  Button: (props: object) => createElement('Button', props),
});
mockModule(new URL('./IconButton.tsx', import.meta.url), {
  IconButton: (props: object) => createElement('IconButton', props),
});
mockModule(new URL('./useSafeAreaPadding.ts', import.meta.url), {
  useSafeAreaPadding: () => ({}),
});

let FormOverlay: typeof FormOverlayExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ FormOverlay } = await import('./FormOverlay'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

test('dirty form close uses the shared discard flow before closing', async () => {
  const onRequestClose = mock.fn();

  function DirtyForm({ onStateChange }: { onStateChange: (state: FormOverlayState) => void }) {
    useEffect(() => {
      onStateChange({ dirty: true, submitting: false });
    }, [onStateChange]);
    return createElement('DirtyForm');
  }

  await act(async () => {
    renderer = create(
      createElement(FormOverlay, {
        discardConfirmLabel: '신고 버리기',
        discardTitle: '작성 중인 신고를 버릴까요?',
        onRequestClose,
        renderForm: ({ onStateChange }) => createElement(DirtyForm, { onStateChange }),
        testIDPrefix: 'content-report',
        title: '게시물 신고',
        visible: true,
      }),
    );
  });
  assert.ok(renderer);

  const close = renderer.root.find((node) => (node.type as unknown) === 'IconButton');
  await act(async () => close.props.onPress());
  assert.equal(onRequestClose.mock.callCount(), 0);

  const alertDialog = renderer.root.find(
    (node) => (node.type as unknown) === 'View' && node.props.role === 'alertdialog',
  );
  assert.equal(alertDialog.props.accessibilityLabel, '작성 중인 신고를 버릴까요?');

  const buttons = renderer.root.findAll((node) => (node.type as unknown) === 'Button');
  assert.deepEqual(
    buttons.map((button) => button.props.children),
    ['계속 작성', '신고 버리기'],
  );
  await act(async () => buttons[1]?.props.onPress());
  assert.equal(onRequestClose.mock.callCount(), 1);
});
