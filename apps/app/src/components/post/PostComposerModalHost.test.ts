import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerModalHost as PostComposerModalHostComponent } from './PostComposerModalHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let platformOS: 'android' | 'ios' = 'android';
let exitMounted = false;
const progress = { interpolate: () => 0 };

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Modal: 'Modal',
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('@/components/ui/ModalSheetHost', {
  ModalSheetHost: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Modal', props, children as never),
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible || exitMounted,
    progress,
  }),
});

let PostComposerModalHost: typeof PostComposerModalHostComponent;

before(async () => {
  ({ PostComposerModalHost } = await import('./PostComposerModalHost'));
});

afterEach(() => {
  exitMounted = false;
  platformOS = 'android';
  mock.restoreAll();
});

test('Android Native composer waits for overlay presence to end before dismissal', async () => {
  let dismissCount = 0;
  let closeRequestCount = 0;
  let renderer!: ReactTestRenderer;
  const onDismiss = () => {
    dismissCount += 1;
  };
  await act(async () => {
    renderer = create(
      createElement(PostComposerModalHost, {
        accessibilityLabel: '글쓰기',
        interactionDisabled: false,
        onDismiss,
        onRequestClose: () => {
          closeRequestCount += 1;
        },
        visible: true,
      }),
    );
  });

  let modal = renderer.root.findByType('Modal' as ElementType);
  assert.equal(modal.props.animationType, 'none');
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.onDismiss, undefined);
  assert.equal(renderer.root.findByType('AnimatedView' as ElementType).props.style[0].flex, 1);

  exitMounted = true;
  await act(async () => {
    renderer.update(
      createElement(PostComposerModalHost, {
        accessibilityLabel: '글쓰기',
        interactionDisabled: false,
        onDismiss,
        onRequestClose: () => {
          closeRequestCount += 1;
        },
        visible: false,
      }),
    );
  });

  modal = renderer.root.findByType('Modal' as ElementType);
  const root = renderer.root.findByType('AnimatedView' as ElementType);
  assert.equal(modal.props.visible, true);
  assert.equal(root.props.pointerEvents, 'none');
  assert.equal(root.props.accessibilityElementsHidden, true);
  assert.equal(root.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(dismissCount, 0);
  await act(async () => modal.props.onRequestClose());
  assert.equal(closeRequestCount, 0);

  exitMounted = false;
  await act(async () => {
    renderer.update(
      createElement(PostComposerModalHost, {
        accessibilityLabel: '글쓰기',
        interactionDisabled: false,
        onDismiss,
        onRequestClose: () => {
          closeRequestCount += 1;
        },
        visible: false,
      }),
    );
  });
  assert.equal(renderer.root.findByType('Modal' as ElementType).props.visible, false);
  assert.equal(dismissCount, 1);
  await act(async () => renderer.unmount());
});

test('iOS Native composer reports the platform Modal onDismiss callback', async () => {
  platformOS = 'ios';
  let dismissCount = 0;
  let renderer!: ReactTestRenderer;
  const props = {
    accessibilityLabel: '글쓰기',
    interactionDisabled: false,
    onDismiss: () => {
      dismissCount += 1;
    },
  };
  await act(async () => {
    renderer = create(createElement(PostComposerModalHost, { ...props, visible: true }));
  });

  let modal = renderer.root.findByType('Modal' as ElementType);
  assert.equal(modal.props.animationType, 'fade');
  assert.equal(modal.props.visible, true);

  await act(async () => {
    renderer.update(createElement(PostComposerModalHost, { ...props, visible: false }));
  });
  modal = renderer.root.findByType('Modal' as ElementType);
  assert.equal(modal.props.visible, false);
  assert.equal(typeof modal.props.onDismiss, 'function');
  assert.equal(dismissCount, 0);
  await act(async () => modal.props.onDismiss());
  assert.equal(dismissCount, 1);
  await act(async () => renderer.unmount());
});
