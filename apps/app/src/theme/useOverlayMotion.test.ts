import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as OverlayMotionModule from './useOverlayMotion';

const timingCalls: Array<Record<string, unknown>> = [];
let reducedMotion = false;

class AnimatedValue {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  setValue(value: number) {
    this.value = value;
  }
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mockModule('react-native', {
  Animated: {
    Value: AnimatedValue,
    timing: (value: AnimatedValue, config: Record<string, unknown>) => {
      timingCalls.push(config);
      return {
        start: (callback?: (result: { finished: boolean }) => void) => {
          value.setValue(config.toValue as number);
          callback?.({ finished: true });
        },
        stop: () => undefined,
      };
    },
  },
  Easing: { bezier: (...points: number[]) => points.join(',') },
});
mockModule('@/theme/ThemeProvider', { useReducedMotion: () => reducedMotion });
mockModule('@/theme/tokens', {
  motion: {
    duration: { emphasized: 360, fast: 120, standard: 200 },
    easingPoints: { enter: [0.16, 1, 0.3, 1], exit: [0.4, 0, 1, 1] },
  },
});

let overlayMotionModule: typeof OverlayMotionModule | undefined;

before(async () => {
  overlayMotionModule = await import('./useOverlayMotion');
});

test('overlay motion uses approved enter and exit timing', async () => {
  assert.ok(overlayMotionModule);
  let result: ReturnType<typeof overlayMotionModule.useOverlayMotion> | undefined;

  function Harness({ visible }: { visible: boolean }) {
    result = overlayMotionModule?.useOverlayMotion(visible);
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Harness, { visible: false }));
  });
  timingCalls.length = 0;

  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  assert.equal(result?.mounted, true);
  assert.equal(result?.entered, true);
  assert.deepEqual(timingCalls.at(-1), {
    duration: 360,
    easing: '0.16,1,0.3,1',
    toValue: 1,
    useNativeDriver: true,
  });

  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  assert.equal(result?.mounted, false);
  assert.deepEqual(timingCalls.at(-1), {
    duration: 200,
    easing: '0.4,0,1,1',
    toValue: 0,
    useNativeDriver: true,
  });
  await act(async () => renderer?.unmount());
});

test('reduced motion presents and dismisses overlays without timing', async () => {
  assert.ok(overlayMotionModule);
  reducedMotion = true;
  timingCalls.length = 0;
  let result: ReturnType<typeof overlayMotionModule.useOverlayMotion> | undefined;

  function Harness({ visible }: { visible: boolean }) {
    result = overlayMotionModule?.useOverlayMotion(visible);
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Harness, { visible: true }));
  });
  assert.equal(result?.mounted, true);
  assert.equal(result?.entered, true);
  assert.equal(timingCalls.length, 0);

  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  assert.equal(result?.mounted, false);
  assert.equal(timingCalls.length, 0);
  await act(async () => renderer?.unmount());
  reducedMotion = false;
});

test('toast motion uses standard enter and fast exit timing', async () => {
  assert.ok(overlayMotionModule);
  timingCalls.length = 0;
  let result: ReturnType<typeof overlayMotionModule.useToastMotion> | undefined;

  function Harness({ visible }: { visible: boolean }) {
    result = overlayMotionModule?.useToastMotion(visible);
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Harness, { visible: false }));
  });
  timingCalls.length = 0;

  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  assert.equal(result?.mounted, true);
  assert.equal(result?.entered, true);
  assert.equal(timingCalls.at(-1)?.duration, 200);

  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  assert.equal(result?.mounted, false);
  assert.equal(timingCalls.at(-1)?.duration, 120);
  await act(async () => renderer?.unmount());
});
