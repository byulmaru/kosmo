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

test('Web ModalSheet host follows visual viewport changes in both dialog paths', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    height: 520,
    offsetTop: 0,
    addEventListener: (type: string, listener: () => void) => {
      const typeListeners = listeners.get(type) ?? new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { visualViewport: viewport } as unknown as Window,
  });

  try {
    for (const role of ['dialog', 'alertdialog'] as const) {
      let renderer: ReactTestRenderer;
      const props = { role, visible: true, interactionDisabled: false, children: '확인' };
      await act(async () => {
        renderer = create(createElement(webHostModule.ModalSheetHost, props));
      });
      const host = renderer!.root.findByType(role === 'dialog' ? 'div' : 'dialog');
      assert.equal(host.props.style.height, 520);
      assert.equal(host.props.style.top, 0);
      assert.equal(host.props.style.position, 'fixed');

      viewport.height = 360;
      viewport.offsetTop = 48;
      await act(async () => listeners.get('resize')?.forEach((listener) => listener()));
      assert.equal(host.props.style.height, 360);
      assert.equal(host.props.style.top, 48);

      viewport.offsetTop = 72;
      await act(async () => listeners.get('scroll')?.forEach((listener) => listener()));
      assert.equal(host.props.style.top, 72);

      await act(async () => {
        renderer!.update(createElement(webHostModule.ModalSheetHost, { ...props, visible: false }));
      });
      assert.equal(host.props.style.top, undefined);
      assert.equal(host.props.style.height, role === 'dialog' ? undefined : '100%');
      assert.equal(listeners.get('resize')?.size, 0);
      assert.equal(listeners.get('scroll')?.size, 0);

      viewport.height = 420;
      viewport.offsetTop = 24;
      await act(async () => {
        renderer!.update(createElement(webHostModule.ModalSheetHost, props));
      });
      assert.equal(host.props.style.height, 420);
      assert.equal(host.props.style.top, 24);

      await act(async () => renderer!.unmount());
      assert.equal(listeners.get('resize')?.size, 0);
      assert.equal(listeners.get('scroll')?.size, 0);
      viewport.height = 520;
      viewport.offsetTop = 0;
    }
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('Web ModalSheet host falls back without visualViewport and treats omitted visible as active', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const props = { role: 'dialog' as const, interactionDisabled: false, children: '확인' };

  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { visualViewport: undefined } as unknown as Window,
    });
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(webHostModule.ModalSheetHost, props));
    });
    const baseHost = renderer!.root.findByType('div');
    assert.equal(baseHost.props.style.position, undefined);
    assert.equal(baseHost.props.style.top, undefined);
    assert.equal(baseHost.props.style.height, undefined);
    await act(async () => renderer!.unmount());

    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      height: 480,
      offsetTop: 12,
      addEventListener: (type: string, listener: () => void) => {
        const typeListeners = listeners.get(type) ?? new Set();
        typeListeners.add(listener);
        listeners.set(type, typeListeners);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { visualViewport: viewport } as unknown as Window,
    });
    await act(async () => {
      renderer = create(createElement(webHostModule.ModalSheetHost, props));
    });
    const host = renderer!.root.findByType('div');
    assert.equal(renderer!.root.findByType('Modal' as never).props.visible, undefined);
    assert.equal(host.props.style.height, 480);
    assert.equal(host.props.style.top, 12);
    assert.equal(listeners.get('resize')?.size, 1);

    await act(async () => renderer!.unmount());
    assert.equal(listeners.get('resize')?.size, 0);
    assert.equal(listeners.get('scroll')?.size, 0);
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('Web alertdialog with omitted visible does not activate its viewport host', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    height: 480,
    offsetTop: 12,
    addEventListener: (type: string, listener: () => void) => {
      const typeListeners = listeners.get(type) ?? new Set();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { visualViewport: viewport } as unknown as Window,
  });

  try {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(webHostModule.ModalSheetHost, {
          interactionDisabled: false,
          role: 'alertdialog',
          children: '확인',
        }),
      );
    });
    const host = renderer!.root.findByType('dialog');
    assert.equal(host.props.style.height, '100%');
    assert.equal(host.props.style.top, undefined);
    assert.equal(listeners.get('resize')?.size ?? 0, 0);
    assert.equal(listeners.get('scroll')?.size ?? 0, 0);
    await act(async () => renderer!.unmount());
  } finally {
    if (previousWindow) {
      Object.defineProperty(globalThis, 'window', previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});
