import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as OverlayMotionModule from './useOverlayMotion';

const timingCalls: Array<Record<string, unknown>> = [];
type PendingAnimation = {
  callback?: (result: { finished: boolean }) => void;
  completed: boolean;
  config: Record<string, unknown>;
  stopped: boolean;
  value: AnimatedValue;
};

const pendingAnimations: PendingAnimation[] = [];
let autoCompleteAnimations = true;
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

function completeAnimation(animation: PendingAnimation, finished = true) {
  if (animation.completed || animation.stopped) {
    return;
  }
  animation.completed = true;
  animation.value.setValue(animation.config.toValue as number);
  animation.callback?.({ finished });
}

function completeLatestAnimation() {
  const animation = [...pendingAnimations]
    .reverse()
    .find((candidate) => !candidate.completed && !candidate.stopped);
  assert.ok(animation);
  completeAnimation(animation);
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
      const animation: PendingAnimation = {
        config,
        completed: false,
        stopped: false,
        value,
      };
      pendingAnimations.push(animation);
      return {
        start: (callback?: (result: { finished: boolean }) => void) => {
          animation.callback = callback;
          if (autoCompleteAnimations) {
            completeAnimation(animation);
          }
        },
        stop: () => {
          animation.stopped = true;
        },
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

afterEach(() => {
  autoCompleteAnimations = true;
  pendingAnimations.length = 0;
  reducedMotion = false;
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

test('overlay exit callback는 실제 exit 완료에서만 호출되고 reopen으로 취소된다', async () => {
  assert.ok(overlayMotionModule);
  autoCompleteAnimations = false;
  let exitCount = 0;
  let result: ReturnType<typeof overlayMotionModule.useOverlayMotion> | undefined;

  function Harness({ visible }: { visible: boolean }) {
    result = overlayMotionModule?.useOverlayMotion(visible, () => exitCount++);
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(Harness, { visible: false }));
  });
  assert.equal(exitCount, 0);

  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  await act(async () => completeLatestAnimation());
  assert.equal(exitCount, 1);

  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  await act(async () => completeLatestAnimation());
  assert.equal(result?.mounted, true);

  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  assert.equal(exitCount, 1);
  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  await act(async () => completeLatestAnimation());
  assert.equal(exitCount, 1);

  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  await act(async () => completeLatestAnimation());
  assert.equal(exitCount, 2);
  await act(async () => renderer?.unmount());
});

test('reduced motion exit callback도 초기 closed에서는 호출하지 않는다', async () => {
  assert.ok(overlayMotionModule);
  reducedMotion = true;
  let exitCount = 0;
  let renderer: ReactTestRenderer | undefined;

  function Harness({ visible }: { visible: boolean }) {
    overlayMotionModule?.useOverlayMotion(visible, () => exitCount++);
    return null;
  }

  await act(async () => {
    renderer = create(createElement(Harness, { visible: false }));
  });
  assert.equal(exitCount, 0);
  await act(async () => renderer?.update(createElement(Harness, { visible: true })));
  await act(async () => renderer?.update(createElement(Harness, { visible: false })));
  assert.equal(exitCount, 1);
  await act(async () => renderer?.unmount());
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
