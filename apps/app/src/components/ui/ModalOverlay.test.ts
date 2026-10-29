import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ModalOverlayModule from './ModalOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

let exitMounted = false;
let platformOS: 'android' | 'ios' | 'web' = 'android';

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Modal: 'Modal',
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: 'Pressable',
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ overlayScrim: 'scrim' }),
});
mockModule('@/theme/tokens', { space: { 12: 12, 16: 16 } });
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible || exitMounted,
    progress: { interpolate: () => 0 },
  }),
});

const PressableHost = 'Pressable' as unknown as ElementType;
let modalOverlayModule: typeof ModalOverlayModule;

before(async () => {
  modalOverlayModule = await import('./ModalOverlay');
});

afterEach(() => {
  exitMounted = false;
  platformOS = 'android';
});

test('ModalOverlay closes from its backdrop or native back while preserving inside actions', async () => {
  let closeRequests = 0;
  let insideActions = 0;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(
        modalOverlayModule.ModalOverlay,
        {
          accessibilityLabel: '반응 선택',
          backdropTestID: 'overlay-backdrop',
          onRequestClose: () => {
            closeRequests += 1;
          },
          presentation: 'sheet',
          testID: 'overlay-surface',
          visible: true,
        },
        createElement(PressableHost, {
          onPress: () => {
            insideActions += 1;
          },
          testID: 'inside-action',
        }),
      ),
    );
  });

  const modal = renderer.root.findByType('Modal' as never);
  const backdrop = renderer.root.findByProps({ testID: 'overlay-backdrop' });
  assert.equal(modal.props.accessibilityLabel, '반응 선택');
  assert.equal(modal.props.visible, true);
  assert.equal(backdrop.props.disabled, false);
  assert.equal(backdrop.props.accessible, false);

  await act(async () => renderer.root.findByProps({ testID: 'inside-action' }).props.onPress());
  assert.equal(insideActions, 1);
  assert.equal(closeRequests, 0);
  await act(async () => backdrop.props.onPress());
  await act(async () => modal.props.onRequestClose());
  assert.equal(closeRequests, 2);
  await act(async () => renderer.unmount());
});

test('ModalOverlay blocks dismissal when disabled and makes an exiting surface inert', async () => {
  let closeRequests = 0;
  let dismissed = 0;
  let renderer!: ReactTestRenderer;
  const onRequestClose = () => {
    closeRequests += 1;
  };
  const onDismiss = () => {
    dismissed += 1;
  };
  await act(async () => {
    renderer = create(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '확인',
        backdropTestID: 'overlay-backdrop',
        dismissDisabled: true,
        onDismiss,
        onRequestClose,
        visible: true,
      }),
    );
  });
  const modal = renderer.root.findByType('Modal' as never);
  const backdrop = renderer.root.findByProps({ testID: 'overlay-backdrop' });
  assert.equal(backdrop.props.disabled, true);
  await act(async () => backdrop.props.onPress());
  await act(async () => modal.props.onRequestClose());
  assert.equal(closeRequests, 0);

  exitMounted = true;
  await act(async () =>
    renderer.update(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '확인',
        backdropTestID: 'overlay-backdrop',
        onDismiss,
        onRequestClose,
        visible: false,
      }),
    ),
  );
  const root = renderer.root.findByType('View' as never);
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, true);
  assert.equal(root.props.pointerEvents, 'none');
  assert.equal(root.props.accessibilityElementsHidden, true);
  assert.equal(root.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(renderer.root.findByProps({ testID: 'overlay-backdrop' }).props.disabled, true);
  assert.equal(dismissed, 0);
  await act(async () => renderer.root.findByType('Modal' as never).props.onRequestClose());
  assert.equal(closeRequests, 0);

  exitMounted = false;
  await act(async () =>
    renderer.update(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '확인',
        onDismiss,
        onRequestClose,
        visible: false,
      }),
    ),
  );
  assert.equal(dismissed, 1);
  await act(async () => renderer.unmount());
});

test('ModalOverlay forwards the native dismissal lifecycle on iOS', async () => {
  platformOS = 'ios';
  let dismissed = 0;
  let renderer!: ReactTestRenderer;
  const props = {
    accessibilityLabel: '확인',
    onDismiss: () => {
      dismissed += 1;
    },
    onRequestClose: () => {},
  };
  await act(async () => {
    renderer = create(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: true }));
  });

  exitMounted = true;
  await act(async () =>
    renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
  );
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, true);
  assert.equal(dismissed, 0);

  exitMounted = false;
  await act(async () =>
    renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
  );
  assert.equal(renderer.root.findByType('Modal' as never).props.visible, false);
  assert.equal(dismissed, 0);
  const modal = renderer.root.findByType('Modal' as never);
  assert.equal(typeof modal.props.onDismiss, 'function');
  await act(async () => modal.props.onDismiss());
  assert.equal(dismissed, 1);
  await act(async () =>
    renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
  );
  assert.equal(dismissed, 1);
  await act(async () => renderer.unmount());
});

test('ModalOverlay keeps custom geometry while preserving its shared presence boundary', async () => {
  let closeRequests = 0;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '폼',
        onRequestClose: () => {
          closeRequests += 1;
        },
        rootStyle: { padding: 0 },
        surfaceStyle: { maxWidth: 600, width: 600 },
        visible: true,
      }),
    );
  });

  const root = renderer.root.findByType('View' as never);
  const surface = renderer.root.findAllByType('AnimatedView' as never)[1];
  assert.equal(root.props.style.at(-1).padding, 0);
  assert.equal(surface.props.style[1].maxWidth, 600);
  assert.equal(surface.props.style[1].width, 600);

  exitMounted = true;
  await act(async () =>
    renderer.update(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '폼',
        onRequestClose: () => {
          closeRequests += 1;
        },
        rootStyle: { padding: 0 },
        surfaceStyle: { maxWidth: 600, width: 600 },
        visible: false,
      }),
    ),
  );
  await act(async () =>
    renderer.update(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '폼',
        onRequestClose: () => {
          closeRequests += 1;
        },
        rootStyle: { padding: 0 },
        surfaceStyle: { maxWidth: 600, width: 600 },
        visible: true,
      }),
    ),
  );
  await act(async () => renderer.root.findByType('Modal' as never).props.onRequestClose());
  assert.equal(closeRequests, 1);
  await act(async () => renderer.unmount());
});

test('ModalOverlay supports a left drawer with independent backdrop dismissal', async () => {
  let backdropCloses = 0;
  let systemCloses = 0;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(modalOverlayModule.ModalOverlay, {
        accessibilityLabel: '메뉴',
        backdropAccessibilityLabel: '사이드바 닫기',
        onBackdropPress: () => {
          backdropCloses += 1;
        },
        onRequestClose: () => {
          systemCloses += 1;
        },
        presentation: 'drawer',
        rootStyle: { paddingRight: 12 },
        surfaceNativeID: 'mobile-sidebar',
        surfaceStyle: { width: 320 },
        visible: true,
      }),
    );
  });

  const root = renderer.root.findByType('View' as never);
  const backdrop = renderer.root.findByProps({ accessibilityLabel: '사이드바 닫기' });
  const surface = renderer.root.findAllByType('AnimatedView' as never)[1];
  const modal = renderer.root.findByType('Modal' as never);
  assert.equal(root.props.style[0].flexDirection, 'row');
  assert.equal(root.props.style.at(-1).paddingRight, 12);
  assert.equal(surface.props.nativeID, 'mobile-sidebar');
  await act(async () => backdrop.props.onPress());
  await act(async () => modal.props.onRequestClose());
  assert.equal(backdropCloses, 1);
  assert.equal(systemCloses, 1);
  await act(async () => renderer.unmount());
});
