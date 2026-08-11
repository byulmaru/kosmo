import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { semanticColors } from './tokens';
import type * as ThemeModule from './ThemeProvider';

let reduceMotionListener: ((enabled: boolean) => void) | undefined;
let osReduceMotion = false;
let pendingOsReduceMotion: Promise<boolean> | undefined;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-native', {
  AccessibilityInfo: {
    addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
      reduceMotionListener = listener;
      return { remove: () => (reduceMotionListener = undefined) };
    },
    isReduceMotionEnabled: async () => pendingOsReduceMotion ?? osReduceMotion,
  },
});

let themeModule: typeof ThemeModule | undefined;

before(async () => {
  themeModule = await import('./ThemeProvider');
});

test('Light canvas and elevated use white while surface uses neutral 0', () => {
  assert.equal(semanticColors.light.backgroundCanvas, '#FFFFFF');
  assert.equal(semanticColors.light.backgroundElevated, '#FFFFFF');
  assert.equal(semanticColors.light.backgroundSurface, '#FAFAFB');
});

test('explicit Dark mode selects production semantic colors without activating it app-wide', async () => {
  assert.ok(themeModule);
  const { ThemeProvider, useReducedMotion, useTheme } = themeModule;
  let backgroundCanvas: string | undefined;
  let legacyBackground: string | undefined;
  let reducedMotion: boolean | undefined;

  function CaptureTheme() {
    const theme = useTheme();
    backgroundCanvas = theme?.backgroundCanvas;
    legacyBackground = theme?.background;
    reducedMotion = useReducedMotion();
    return null;
  }

  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(
      createElement(
        ThemeProvider,
        { mode: 'dark', reduceMotion: true },
        createElement(CaptureTheme),
      ),
    );
  });

  assert.equal(backgroundCanvas, '#18181B');
  assert.equal(legacyBackground, '#111111');
  assert.equal(reducedMotion, true);
  await act(async () => renderer?.unmount());
});

test('OS reduced-motion preference is the default input and follows changes', async () => {
  assert.ok(themeModule);
  const { ThemeProvider, useReducedMotion } = themeModule;
  osReduceMotion = true;
  let reducedMotion: boolean | undefined;

  function CapturePreference() {
    reducedMotion = useReducedMotion();
    return null;
  }

  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });
  assert.equal(reducedMotion, true);

  await act(async () => reduceMotionListener?.(false));
  assert.equal(reducedMotion, false);
  await act(async () => renderer?.unmount());
});

test('motion stays reduced until the OS preference is known', async () => {
  assert.ok(themeModule);
  const { ThemeProvider, useReducedMotion } = themeModule;
  let resolvePreference: ((value: boolean) => void) | undefined;
  pendingOsReduceMotion = new Promise<boolean>((resolve) => {
    resolvePreference = resolve;
  });
  let reducedMotion: boolean | undefined;

  function CapturePreference() {
    reducedMotion = useReducedMotion();
    return null;
  }

  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });
  assert.equal(reducedMotion, true);

  await act(async () => resolvePreference?.(false));
  assert.equal(reducedMotion, false);
  pendingOsReduceMotion = undefined;
  await act(async () => renderer?.unmount());
});
