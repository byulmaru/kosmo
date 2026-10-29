import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it } from 'node:test';
import { act, createElement, forwardRef } from 'react';
import { create } from 'react-test-renderer';
import type { ComponentType, ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

type KeyboardEventName =
  | 'keyboardDidHide'
  | 'keyboardDidShow'
  | 'keyboardWillHide'
  | 'keyboardWillShow';
type KeyboardEvent = {
  duration?: number;
  easing?: string;
  endCoordinates: { height: number; screenY: number };
};
type KeyboardListener = (event: KeyboardEvent) => void;
type HostProps = {
  onLayout?: (event: { nativeEvent: { layout: Layout }; persist: () => void }) => void;
  style?: unknown;
};
type Layout = { height: number; width: number; x: number; y: number };
type KeyboardAvoidingViewProps = {
  behavior?: 'height';
  children?: ReactNode;
  keyboardVerticalOffset?: number;
  style?: unknown;
};

const require = createRequire(import.meta.url);
const babel = require('@babel/core') as {
  transformFileSync: (
    filename: string,
    options: Record<string, unknown>,
  ) => { code?: string } | null;
};

const installedReactNativeSource =
  require.resolve('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js');
const installedReactNativeRequire = createRequire(installedReactNativeSource);
const moduleInternals = require('node:module') as {
  _extensions: Record<
    string,
    (module: { _compile: (code: string, filename: string) => void }, filename: string) => void
  >;
  _load: (request: string, parent: { filename?: string } | null, isMain: boolean) => unknown;
};

const reactNativeSource = process.env.KOSMO_TEST_RN_KAV_SOURCE ?? installedReactNativeSource;
const expoPreset = require.resolve('babel-preset-expo');
const originalLoad = moduleInternals._load;
const originalJsLoader = moduleInternals._extensions['.js'];
const platform = { OS: 'android' };
const listeners = new Map<KeyboardEventName, KeyboardListener>();
const Keyboard = {
  isVisible: () => false,
  addListener(name: KeyboardEventName, listener: KeyboardListener) {
    listeners.set(name, listener);
    return { remove: () => listeners.delete(name) };
  },
};
const LayoutAnimation = {
  Types: { keyboard: 'keyboard' },
  configureNext: () => undefined,
};
const StyleSheet = {
  compose: (first: unknown, second: unknown) =>
    first == null ? second : second == null ? first : [first, second],
};
const View = forwardRef<unknown, HostProps & { children?: ReactNode }>((props, ref) =>
  createElement('View', { ...props, ref }, props.children),
);
const AccessibilityInfo = { prefersCrossFadeTransitions: async () => false };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function loadKeyboardAvoidingView() {
  moduleInternals._load = function load(request, parent, isMain) {
    if (parent?.filename === reactNativeSource) {
      const mocks: Record<string, unknown> = {
        '../../LayoutAnimation/LayoutAnimation': { __esModule: true, default: LayoutAnimation },
        '../../StyleSheet/StyleSheet': { __esModule: true, default: StyleSheet },
        '../../Utilities/Platform': { __esModule: true, default: platform },
        '../AccessibilityInfo/AccessibilityInfo': { __esModule: true, default: AccessibilityInfo },
        '../View/View': { __esModule: true, default: View },
        './Keyboard': { __esModule: true, default: Keyboard },
      };
      if (request in mocks) {
        return mocks[request];
      }
      if (reactNativeSource !== installedReactNativeSource && !request.startsWith('.')) {
        return installedReactNativeRequire(request);
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  moduleInternals._extensions['.js'] = function loadJs(module, filename) {
    if (filename === reactNativeSource) {
      const transformed = babel.transformFileSync(filename, {
        babelrc: false,
        configFile: false,
        presets: [expoPreset],
      });
      module._compile(transformed?.code ?? '', filename);
      return;
    }
    return originalJsLoader.call(this, module, filename);
  };

  delete require.cache[reactNativeSource];
  try {
    return (require(reactNativeSource) as { default: ComponentType<KeyboardAvoidingViewProps> })
      .default;
  } finally {
    moduleInternals._load = originalLoad;
    moduleInternals._extensions['.js'] = originalJsLoader;
  }
}

const flattenStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flattenStyle))
    : ((style ?? {}) as Record<string, unknown>);

const event = (screenY: number, height: number): KeyboardEvent => ({
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { height, screenY },
});

let KeyboardAvoidingView: ComponentType<KeyboardAvoidingViewProps>;
let renderer: ReactTestRenderer | undefined;

async function flush() {
  await act(async () => undefined);
}

async function layout(height: number) {
  const view = renderer?.root.findByType('View' as ElementType);
  assert.ok(view);
  const onLayout = (view.props as HostProps).onLayout;
  assert.ok(onLayout);
  await act(async () => {
    onLayout({
      nativeEvent: { layout: { height, width: 360, x: 0, y: 0 } },
      persist: () => undefined,
    });
    await flush();
  });
}

function renderedHeight() {
  const view = renderer?.root.findByType('View' as ElementType);
  assert.ok(view);
  return flattenStyle((view.props as HostProps).style).height;
}

before(() => {
  KeyboardAvoidingView = loadKeyboardAvoidingView();
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  listeners.clear();
});

describe('React Native KeyboardAvoidingView', { concurrency: false }, () => {
  it('restores height after Android hide, handles delayed layouts, and shrinks again on show', async () => {
    platform.OS = 'android';
    listeners.clear();
    await act(async () => {
      renderer = create(
        createElement(KeyboardAvoidingView, {
          behavior: 'height',
          keyboardVerticalOffset: 50,
          style: { flex: 1, height: 800 },
        }),
      );
    });
    await layout(800);
    assert.equal(renderedHeight(), 800);

    const show = listeners.get('keyboardDidShow');
    const hide = listeners.get('keyboardDidHide');
    assert.ok(show);
    assert.ok(hide);
    await act(async () => {
      show(event(550, 300));
      await flush();
    });
    assert.equal(renderedHeight(), 500);

    await layout(500);
    await act(async () => {
      hide(event(800, 0));
      await flush();
    });
    assert.equal(renderedHeight(), 800);

    await layout(800);
    assert.equal(renderedHeight(), 800);
    await act(async () => {
      show(event(550, 300));
      await flush();
    });
    assert.equal(renderedHeight(), 500);
  });

  it('keeps the existing iOS hide behavior', async () => {
    platform.OS = 'ios';
    listeners.clear();
    await act(async () => {
      renderer = create(
        createElement(KeyboardAvoidingView, {
          behavior: 'height',
          keyboardVerticalOffset: 50,
          style: { flex: 1, height: 800 },
        }),
      );
    });
    await layout(800);

    const show = listeners.get('keyboardWillShow');
    const hide = listeners.get('keyboardWillHide');
    assert.ok(show);
    assert.ok(hide);
    await act(async () => {
      show(event(550, 300));
      await flush();
    });
    assert.equal(renderedHeight(), 500);
    await act(async () => {
      hide(event(800, 0));
      await flush();
    });
    assert.equal(renderedHeight(), 800);
  });
});
