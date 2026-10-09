import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { semanticColors } from './tokens';
import type * as ThemeModule from './ThemeProvider';

let reduceMotionListener: ((enabled: boolean) => void) | undefined;
let osReduceMotion = false;
let pendingOsReduceMotion: Promise<boolean> | undefined;
let reduceMotionQueryCount = 0;

type ReduceMotionSubscription = {
  listener: (enabled: boolean) => void;
  removed: boolean;
};

let reduceMotionSubscriptions: ReduceMotionSubscription[] = [];

function resetAccessibilityMock() {
  reduceMotionListener = undefined;
  osReduceMotion = false;
  pendingOsReduceMotion = undefined;
  reduceMotionQueryCount = 0;
  reduceMotionSubscriptions = [];
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-native', {
  AccessibilityInfo: {
    addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
      const subscription: ReduceMotionSubscription = {
        listener,
        removed: false,
      };
      reduceMotionListener = listener;
      reduceMotionSubscriptions.push(subscription);
      return {
        remove: () => {
          subscription.removed = true;
          if (reduceMotionListener === listener) {
            reduceMotionListener = undefined;
          }
        },
      };
    },
    isReduceMotionEnabled: async () => {
      reduceMotionQueryCount += 1;
      return pendingOsReduceMotion ?? osReduceMotion;
    },
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
  resetAccessibilityMock();
  const { ThemeProvider, useReducedMotion, useTheme } = themeModule;
  let backgroundCanvas: string | undefined;
  let backgroundSurface: string | undefined;
  let backgroundElevated: string | undefined;
  let foregroundPrimary: string | undefined;
  let foregroundSecondary: string | undefined;
  let foregroundMuted: string | undefined;
  let borderSubtle: string | undefined;
  let borderDefault: string | undefined;
  let actionPrimaryDisabled: string | undefined;
  let actionSecondaryBase: string | undefined;
  let actionSecondaryBorder: string | undefined;
  let actionSecondaryHover: string | undefined;
  let actionSecondaryOnBase: string | undefined;
  let actionSecondaryPressed: string | undefined;
  let borderDisabled: string | undefined;
  let stateDisabledSurface: string | undefined;
  let legacyBackground: string | undefined;
  let reducedMotion: boolean | undefined;

  function CaptureTheme() {
    const theme = useTheme();
    backgroundCanvas = theme?.backgroundCanvas;
    backgroundSurface = theme?.backgroundSurface;
    backgroundElevated = theme?.backgroundElevated;
    foregroundPrimary = theme?.foregroundPrimary;
    foregroundSecondary = theme?.foregroundSecondary;
    foregroundMuted = theme?.foregroundMuted;
    borderSubtle = theme?.borderSubtle;
    borderDefault = theme?.borderDefault;
    actionPrimaryDisabled = theme?.actionPrimaryDisabled;
    actionSecondaryBase = theme?.actionSecondaryBase;
    actionSecondaryBorder = theme?.actionSecondaryBorder;
    actionSecondaryHover = theme?.actionSecondaryHover;
    actionSecondaryOnBase = theme?.actionSecondaryOnBase;
    actionSecondaryPressed = theme?.actionSecondaryPressed;
    borderDisabled = theme?.borderDisabled;
    stateDisabledSurface = theme?.stateDisabledSurface;
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

  assert.equal(backgroundCanvas, '#000000');
  assert.deepEqual(
    {
      backgroundSurface,
      backgroundElevated,
      foregroundPrimary,
      foregroundSecondary,
      foregroundMuted,
      borderSubtle,
      borderDefault,
      actionPrimaryDisabled,
      actionSecondaryBase,
      actionSecondaryBorder,
      actionSecondaryHover,
      actionSecondaryOnBase,
      actionSecondaryPressed,
      borderDisabled,
      stateDisabledSurface,
    },
    {
      backgroundSurface: '#18181B',
      backgroundElevated: '#000000',
      foregroundPrimary: '#E0E0E0',
      foregroundSecondary: '#A3A3A3',
      foregroundMuted: '#969696',
      borderSubtle: '#303030',
      borderDefault: '#383838',
      actionPrimaryDisabled: '#262626',
      actionSecondaryBase: '#141414',
      actionSecondaryBorder: '#383838',
      actionSecondaryHover: '#262626',
      actionSecondaryOnBase: '#E0E0E0',
      actionSecondaryPressed: '#303030',
      borderDisabled: '#262626',
      stateDisabledSurface: '#262626',
    },
  );
  assert.equal(legacyBackground, '#000000');
  assert.equal(reducedMotion, true);
  await act(async () => renderer?.unmount());
});

test('OS reduced-motion preference is the default input and follows changes', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
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

test('a late initial ON response cannot overwrite a newer OFF event', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
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
  await act(async () => reduceMotionListener?.(false));
  assert.equal(reducedMotion, false);

  await act(async () => resolvePreference?.(true));
  assert.equal(reducedMotion, false);
  pendingOsReduceMotion = undefined;
  await act(async () => renderer?.unmount());
});

test('a late initial OFF response cannot overwrite a newer ON event', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
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
  await act(async () => reduceMotionListener?.(true));
  assert.equal(reducedMotion, true);

  await act(async () => resolvePreference?.(false));
  assert.equal(reducedMotion, true);
  pendingOsReduceMotion = undefined;
  await act(async () => renderer?.unmount());
});

test('successive OS reduced-motion events update the current preference', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
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

  await act(async () => reduceMotionListener?.(true));
  assert.equal(reducedMotion, true);
  await act(async () => reduceMotionListener?.(false));
  assert.equal(reducedMotion, false);
  await act(async () => reduceMotionListener?.(true));
  assert.equal(reducedMotion, true);

  await act(async () => resolvePreference?.(false));
  assert.equal(reducedMotion, true);
  pendingOsReduceMotion = undefined;
  await act(async () => renderer?.unmount());
});

test('unmount cleanup removes the subscription and ignores a late old response', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
  const { ThemeProvider, useReducedMotion } = themeModule;
  let resolveOldPreference: ((value: boolean) => void) | undefined;
  pendingOsReduceMotion = new Promise<boolean>((resolve) => {
    resolveOldPreference = resolve;
  });
  let reducedMotion: boolean | undefined;

  function CapturePreference() {
    reducedMotion = useReducedMotion();
    return null;
  }

  let firstRenderer: ReturnType<typeof create> | undefined;
  act(() => {
    firstRenderer = create(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });
  const oldSubscription = reduceMotionSubscriptions[reduceMotionSubscriptions.length - 1];
  assert.ok(oldSubscription);

  await act(async () => firstRenderer?.unmount());
  assert.equal(oldSubscription.removed, true);

  let resolveCurrentPreference: ((value: boolean) => void) | undefined;
  pendingOsReduceMotion = new Promise<boolean>((resolve) => {
    resolveCurrentPreference = resolve;
  });
  let secondRenderer: ReturnType<typeof create> | undefined;
  act(() => {
    secondRenderer = create(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });

  await act(async () => resolveOldPreference?.(false));
  assert.equal(reducedMotion, true);
  await act(async () => resolveCurrentPreference?.(false));
  assert.equal(reducedMotion, false);
  await act(async () => secondRenderer?.unmount());
  pendingOsReduceMotion = undefined;
});

test('explicit true and false overrides disable OS input until OS mode returns', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
  const { ThemeProvider, useReducedMotion } = themeModule;
  let reducedMotion: boolean | undefined;

  function CapturePreference() {
    reducedMotion = useReducedMotion();
    return null;
  }

  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(
      createElement(ThemeProvider, { reduceMotion: true }, createElement(CapturePreference)),
    );
  });
  assert.equal(reducedMotion, true);
  assert.equal(reduceMotionQueryCount, 0);
  assert.equal(reduceMotionSubscriptions.length, 0);

  await act(async () => {
    renderer?.update(
      createElement(ThemeProvider, { reduceMotion: false }, createElement(CapturePreference)),
    );
  });
  assert.equal(reducedMotion, false);
  assert.equal(reduceMotionQueryCount, 0);
  assert.equal(reduceMotionSubscriptions.length, 0);

  let resolveOldPreference: ((value: boolean) => void) | undefined;
  pendingOsReduceMotion = new Promise<boolean>((resolve) => {
    resolveOldPreference = resolve;
  });
  await act(async () => {
    renderer?.update(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });
  const oldSubscription = reduceMotionSubscriptions[reduceMotionSubscriptions.length - 1];
  assert.ok(oldSubscription);
  assert.equal(reduceMotionQueryCount, 1);

  await act(async () => {
    renderer?.update(
      createElement(ThemeProvider, { reduceMotion: true }, createElement(CapturePreference)),
    );
  });
  assert.equal(reducedMotion, true);
  assert.equal(oldSubscription.removed, true);

  let resolveCurrentPreference: ((value: boolean) => void) | undefined;
  pendingOsReduceMotion = new Promise<boolean>((resolve) => {
    resolveCurrentPreference = resolve;
  });
  await act(async () => {
    renderer?.update(createElement(ThemeProvider, null, createElement(CapturePreference)));
  });
  assert.equal(reduceMotionQueryCount, 2);

  await act(async () => reduceMotionListener?.(true));
  await act(async () => resolveOldPreference?.(false));
  assert.equal(reducedMotion, true);
  await act(async () => resolveCurrentPreference?.(false));
  assert.equal(reducedMotion, true);

  pendingOsReduceMotion = undefined;
  await act(async () => renderer?.unmount());
});

test('motion stays reduced until the OS preference is known', async () => {
  assert.ok(themeModule);
  resetAccessibilityMock();
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
