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

function styleObjects(style: unknown) {
  return (Array.isArray(style) ? style : [style]).filter(
    (value): value is Record<string, unknown> => value !== null && typeof value === 'object',
  );
}

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

test('ModalOverlay gates dismissal and keeps dialog and fullscreen exits inert', async () => {
  for (const presentation of ['dialog', 'fullscreen'] as const) {
    let closeRequests = 0;
    let dismissed = 0;
    let renderer!: ReactTestRenderer;
    const onRequestClose = () => {
      closeRequests += 1;
    };
    const onDismiss = () => {
      dismissed += 1;
    };
    const props = {
      accessibilityLabel: '확인',
      backdropTestID: 'overlay-backdrop',
      onDismiss,
      onRequestClose,
      presentation,
      testID: 'overlay-surface',
    };

    await act(async () => {
      renderer = create(
        createElement(modalOverlayModule.ModalOverlay, {
          ...props,
          dismissDisabled: true,
          visible: true,
        }),
      );
    });
    const modal = renderer.root.findByType('Modal' as never);
    const backdrops = renderer.root.findAllByProps({ testID: 'overlay-backdrop' });
    assert.equal(backdrops.length, presentation === 'fullscreen' ? 0 : 1);
    if (backdrops[0]) {
      assert.equal(backdrops[0].props.disabled, true);
      await act(async () => backdrops[0].props.onPress());
    }
    await act(async () => modal.props.onRequestClose());
    assert.equal(closeRequests, 0);

    exitMounted = true;
    await act(async () =>
      renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
    );
    const root = renderer.root.findByProps({ testID: 'overlay-surface' });
    assert.equal(renderer.root.findByType('Modal' as never).props.visible, true);
    assert.equal(root.props.pointerEvents, 'none');
    assert.equal(root.props.accessibilityElementsHidden, true);
    assert.equal(root.props.importantForAccessibility, 'no-hide-descendants');
    const exitingBackdrops = renderer.root.findAllByProps({ testID: 'overlay-backdrop' });
    assert.equal(exitingBackdrops.length, presentation === 'fullscreen' ? 0 : 1);
    if (exitingBackdrops[0]) {
      assert.equal(exitingBackdrops[0].props.disabled, true);
    }
    assert.equal(dismissed, 0);
    await act(async () => renderer.root.findByType('Modal' as never).props.onRequestClose());
    assert.equal(closeRequests, 0);

    if (presentation === 'fullscreen') {
      const rootStyles = styleObjects(root.props.style);
      const surfaceStyles = styleObjects(
        renderer.root.findByType('AnimatedView' as never).props.style,
      );
      assert.equal(
        rootStyles.some((style) => style.flex === 1),
        true,
      );
      assert.equal(
        rootStyles.some((style) => style.padding !== undefined),
        false,
      );
      assert.equal(
        surfaceStyles.some((style) => style.flex === 1 && style.width === '100%'),
        true,
      );
      assert.equal(
        surfaceStyles.some((style) => style.maxWidth !== undefined),
        false,
      );
      assert.equal(
        surfaceStyles.some((style) => style.transform !== undefined),
        false,
      );
      assert.equal(
        renderer.root
          .findAllByType('AnimatedView' as never)
          .flatMap((node) => styleObjects(node.props.style))
          .some((style) => style.backgroundColor === 'scrim'),
        false,
      );
      assert.equal(modal.props.transparent, true);
      assert.equal(modal.props.statusBarTranslucent, true);
      assert.equal(modal.props.navigationBarTranslucent, true);
    }

    exitMounted = false;
    await act(async () =>
      renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
    );
    assert.equal(dismissed, 1);
    await act(async () => renderer.unmount());
  }
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

test('ModalOverlay fullscreen on iOS uses native fade and reports native dismissal', async () => {
  platformOS = 'ios';

  for (const config of [
    { expectedStyle: 'overFullScreen', transparent: true },
    {
      expectedStyle: 'fullScreen',
      iosPresentationStyle: 'fullScreen' as const,
      transparent: false,
    },
  ]) {
    let dismissed = 0;
    let renderer!: ReactTestRenderer;
    const props = {
      accessibilityLabel: '게시물 작성',
      onDismiss: () => {
        dismissed += 1;
      },
      onRequestClose: () => {},
      presentation: 'fullscreen' as const,
      testID: 'fullscreen-overlay',
      ...('iosPresentationStyle' in config
        ? { iosPresentationStyle: config.iosPresentationStyle }
        : {}),
    };
    await act(async () => {
      renderer = create(
        createElement(modalOverlayModule.ModalOverlay, { ...props, visible: true }),
      );
    });

    let modal = renderer.root.findByType('Modal' as never);
    assert.equal(modal.props.visible, true);
    assert.equal(modal.props.presentationStyle, config.expectedStyle);
    assert.equal(modal.props.transparent, config.transparent);
    assert.equal(modal.props.animationType, 'fade');
    assert.equal(renderer.root.findAllByProps({ testID: 'overlay-backdrop' }).length, 0);

    exitMounted = true;
    await act(async () =>
      renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
    );
    modal = renderer.root.findByType('Modal' as never);
    const root = renderer.root.findByProps({ testID: 'fullscreen-overlay' });
    const surfaceStyles = styleObjects(
      renderer.root.findByType('AnimatedView' as never).props.style,
    );
    assert.equal(modal.props.visible, false);
    assert.equal(root.props.pointerEvents, 'none');
    assert.equal(
      surfaceStyles.some((style) => style.opacity !== undefined),
      false,
    );
    assert.equal(
      surfaceStyles.some((style) => style.transform !== undefined),
      false,
    );
    assert.equal(dismissed, 0);

    await act(async () => modal.props.onDismiss());
    assert.equal(dismissed, 1);
    await act(async () =>
      renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
    );
    assert.equal(dismissed, 1);
    await act(async () => renderer.unmount());
    exitMounted = false;
  }
});

test('ModalOverlay fullscreen on Web keeps shared exit motion and dismissal handling', async () => {
  platformOS = 'web';
  let dismissed = 0;
  let renderer!: ReactTestRenderer;
  const props = {
    accessibilityLabel: '게시물 작성',
    onDismiss: () => {
      dismissed += 1;
    },
    onRequestClose: () => {},
    presentation: 'fullscreen' as const,
    testID: 'fullscreen-overlay',
  };
  await act(async () => {
    renderer = create(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: true }));
  });

  exitMounted = true;
  await act(async () =>
    renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
  );
  let modal = renderer.root.findByType('Modal' as never);
  const root = renderer.root.findByProps({ testID: 'fullscreen-overlay' });
  const surfaceStyles = styleObjects(renderer.root.findByType('AnimatedView' as never).props.style);
  assert.equal(modal.props.visible, true);
  assert.equal(root.props.pointerEvents, 'none');
  assert.equal(
    surfaceStyles.some((style) => style.opacity !== undefined),
    true,
  );
  assert.equal(
    surfaceStyles.some((style) => style.transform !== undefined),
    false,
  );
  assert.equal(renderer.root.findAllByProps({ testID: 'overlay-backdrop' }).length, 0);
  assert.equal(dismissed, 0);

  exitMounted = false;
  await act(async () =>
    renderer.update(createElement(modalOverlayModule.ModalOverlay, { ...props, visible: false })),
  );
  modal = renderer.root.findByType('Modal' as never);
  assert.equal(modal.props.visible, false);
  assert.equal(typeof modal.props.onDismiss, 'function');
  await act(async () => modal.props.onDismiss());
  assert.equal(dismissed, 1);
  await act(async () => renderer.unmount());
});
