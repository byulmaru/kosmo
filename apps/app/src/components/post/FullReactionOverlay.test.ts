import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FullReactionOverlay as FullReactionOverlayExport } from './FullReactionOverlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let exitMounted = false;
let closeCount = 0;
let focusCount = 0;
let pickerProps: { onClose: () => void; presentation?: string } | undefined;
let modalProps:
  | { onDismiss?: () => void; onRequestClose?: () => void; visible?: boolean }
  | undefined;
let renderer: ReactTestRenderer | null = null;
let FullReactionOverlay: typeof FullReactionOverlayExport;

const documentListeners = new Map<string, (event: unknown) => void>();
const windowListeners = new Map<string, (event: unknown) => void>();
const documentMock = {
  addEventListener: (type: string, listener: (event: unknown) => void) => {
    documentListeners.set(type, listener);
  },
  removeEventListener: (type: string, listener: (event: unknown) => void) => {
    if (documentListeners.get(type) === listener) {
      documentListeners.delete(type);
    }
  },
};
const windowMock = {
  addEventListener: (type: string, listener: (event: unknown) => void) => {
    windowListeners.set(type, listener);
  },
  removeEventListener: (type: string, listener: (event: unknown) => void) => {
    if (windowListeners.get(type) === listener) {
      windowListeners.delete(type);
    }
  },
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Platform: platform,
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
  useWindowDimensions: () => ({ height: 800, width: 1_024 }),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});
mockModule('@/components/reaction/FullReactionPicker', {
  FullReactionPicker: (props: { onClose: () => void; presentation?: string }) => {
    pickerProps = props;
    return createElement('FullReactionPicker', props);
  },
});
mockModule('@/components/ui/ModalOverlay', {
  ModalOverlay: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) => {
    modalProps = props as typeof modalProps;
    return createElement('ModalOverlay', props, children as never);
  },
});
mockModule('@/components/ui/OverlayPortal', {
  OverlayPortal: ({ children }: { children?: unknown }) => children,
});
mockModule('@/theme/tokens', {
  breakpoints: { compact: 768 },
  space: { 8: 8 },
  spacing: { sm: 8, xs: 4 },
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    entered: visible,
    mounted: visible || exitMounted,
    progress: { interpolate: () => 1 },
  }),
});

before(async () => {
  ({ FullReactionOverlay } = await import('./FullReactionOverlay'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'web';
  exitMounted = false;
  closeCount = 0;
  focusCount = 0;
  pickerProps = undefined;
  modalProps = undefined;
  documentListeners.clear();
  windowListeners.clear();
  mock.restoreAll();
});

function installBrowserGlobals() {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentMock });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowMock });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
  });
}

function createTriggerRef() {
  const trigger = {
    contains: () => false,
    focus: () => focusCount++,
    measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
      callback(100, 100, 40, 40),
  };
  return { current: trigger } as never;
}

function renderOverlay(open: boolean) {
  return createElement(FullReactionOverlay, {
    onClose: () => closeCount++,
    onQueryChange: () => undefined,
    onSelect: () => undefined,
    open,
    options: [],
    query: '',
    selectedValues: [],
    triggerRef: createTriggerRef(),
  });
}

describe('FullReactionOverlay', () => {
  it('Web anchored surface는 exit 중 mounted 상태를 유지하지만 상호작용과 dismiss를 차단한다', async () => {
    installBrowserGlobals();
    await act(async () => {
      renderer = create(renderOverlay(true));
    });

    const position = renderer?.root.findByProps({ testID: 'full-reaction-overlay-position' });
    assert.equal(position?.props.pointerEvents, 'auto');
    assert.equal(position?.props['aria-hidden'], undefined);
    assert.equal(documentListeners.has('pointerdown'), true);
    assert.equal(pickerProps?.presentation, 'web');

    exitMounted = true;
    await act(async () => {
      renderer?.update(renderOverlay(false));
    });

    const exitingPosition = renderer?.root.findByProps({
      testID: 'full-reaction-overlay-position',
    });
    assert.equal(exitingPosition?.props.pointerEvents, 'none');
    assert.equal(exitingPosition?.props.accessibilityElementsHidden, true);
    assert.equal(exitingPosition?.props['aria-hidden'], true);
    assert.equal(renderer?.root.findByType('div').props.inert, true);
    assert.equal(documentListeners.has('pointerdown'), false);

    pickerProps?.onClose();
    assert.equal(closeCount, 0);

    exitMounted = false;
    await act(async () => {
      renderer?.update(renderOverlay(false));
    });
    assert.equal(renderer?.toJSON(), null);
  });

  it('Web close는 trigger focus를 복원하고 빠른 reopen 뒤에도 anchored dismiss를 유지한다', async () => {
    installBrowserGlobals();
    await act(async () => {
      renderer = create(renderOverlay(true));
    });

    pickerProps?.onClose();
    assert.equal(closeCount, 1);
    assert.equal(focusCount, 1);

    exitMounted = true;
    await act(async () => {
      renderer?.update(renderOverlay(false));
    });
    await act(async () => {
      renderer?.update(renderOverlay(true));
    });
    const reopenedPosition = renderer?.root.findByProps({
      testID: 'full-reaction-overlay-position',
    });
    assert.equal(reopenedPosition?.props.pointerEvents, 'auto');
    assert.equal(reopenedPosition?.props['aria-hidden'], undefined);

    const outsideTarget = {};
    documentListeners.get('pointerdown')?.({ target: outsideTarget });
    assert.equal(closeCount, 2);
  });

  it('Native 경로는 기존 ModalOverlay와 mobile picker presentation을 유지한다', async () => {
    platform.OS = 'ios';
    await act(async () => {
      renderer = create(renderOverlay(true));
    });

    assert.equal(modalProps?.visible, true);
    assert.equal(pickerProps?.presentation, 'mobile');
    modalProps?.onRequestClose?.();
    assert.equal(closeCount, 1);
    modalProps?.onDismiss?.();
    assert.equal(focusCount, 1);
  });
});
