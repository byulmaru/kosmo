import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as SheetModule from './ModalSheet';
import type * as WebHostModule from './ModalSheetHost.web';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let exitMounted = false;
mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Modal: 'Modal',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
});
mockModule('lucide-react-native', { XIcon: 'XIcon' });
mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), { XIcon: 'XIcon' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({}),
  useElevation: () => ({ overlay: {} }),
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible || exitMounted,
    progress: { interpolate: () => 0 },
  }),
});
mockModule(new URL('./IconButton.tsx', import.meta.url).href, { IconButton: 'IconButton' });
let sheetModule: typeof SheetModule;
let webHostModule: typeof WebHostModule;
before(async () => {
  sheetModule = await import('./ModalSheet');
  webHostModule = await import('./ModalSheetHost.web');
});

test('ModalSheet keeps its exit surface mounted but hides it from input and accessibility', async () => {
  let closed = 0;
  let dismissed = 0;
  let renderer: ReactTestRenderer;
  const props = {
    title: '확인',
    onClose: () => {
      closed += 1;
    },
    onDismiss: () => {
      dismissed += 1;
    },
  };
  await act(async () => {
    renderer = create(createElement(sheetModule.ModalSheet, { ...props, visible: true }));
  });
  exitMounted = true;
  await act(async () =>
    renderer.update(createElement(sheetModule.ModalSheet, { ...props, visible: false })),
  );
  assert.equal(renderer!.root.findByType('Modal' as never).props.visible, true);
  const backdrop = renderer!.root.findAllByType('View' as never)[0]!;
  assert.equal(backdrop.props.pointerEvents, 'none');
  assert.equal(backdrop.props.accessibilityElementsHidden, true);
  assert.equal(backdrop.props.importantForAccessibility, 'no-hide-descendants');
  await act(async () => renderer!.root.findByType('Modal' as never).props.onRequestClose());
  assert.equal(closed, 0);
  assert.equal(dismissed, 0);
  exitMounted = false;
  await act(async () =>
    renderer.update(createElement(sheetModule.ModalSheet, { ...props, visible: false })),
  );
  assert.equal(dismissed, 1);
  await act(async () =>
    renderer.update(createElement(sheetModule.ModalSheet, { ...props, visible: true })),
  );
  assert.equal(renderer!.root.findAllByType('View' as never)[0]!.props.pointerEvents, 'auto');
  await act(async () => renderer.unmount());
});

test('Web ModalSheet host makes closing content inert in both dialog paths', async () => {
  for (const role of ['dialog', 'alertdialog'] as const) {
    let renderer: ReactTestRenderer;
    const props = { role, visible: true, interactionDisabled: false, children: '확인' };
    await act(async () => {
      renderer = create(createElement(webHostModule.ModalSheetHost, props));
    });
    await act(async () =>
      renderer.update(
        createElement(webHostModule.ModalSheetHost, { ...props, interactionDisabled: true }),
      ),
    );
    assert.equal(renderer!.root.findByType('div').props.inert, true);
    await act(async () => renderer.update(createElement(webHostModule.ModalSheetHost, props)));
    assert.equal(renderer!.root.findByType('div').props.inert, false);
    await act(async () => renderer.unmount());
  }
});
