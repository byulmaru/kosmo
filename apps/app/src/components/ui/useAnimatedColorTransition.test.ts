import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as AnimatedColorTransitionModule from './useAnimatedColorTransition';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

type AnimatedColorValue = {
  setValue: (value: string) => void;
  stopAnimation: (callback?: () => void) => void;
  value: string;
};

class AnimatedColorMock implements AnimatedColorValue {
  stopCalls = 0;

  constructor(public value: string) {}

  setValue(value: string) {
    this.value = value;
  }

  stopAnimation(callback?: () => void) {
    this.stopCalls += 1;
    callback?.();
  }
}

type TimingCall = {
  duration: number;
  handle: AnimatedColorMock;
  toValue: AnimatedColorMock;
  useNativeDriver: boolean;
};

const timingCalls: TimingCall[] = [];
const themeKey = {};

mockModule('react-native', {
  processColor: (color: string) => (color === '#4080c080' ? 0x804080c0 : undefined),
  Animated: {
    Color: AnimatedColorMock,
    timing: (handle: AnimatedColorMock, config: Omit<TimingCall, 'handle'>) => {
      const call = { handle, ...config };
      timingCalls.push(call);
      return {
        start: () => undefined,
        stop: () => undefined,
      };
    },
  },
  Easing: { bezier: () => 'standard-easing' },
});
mockModule('@/theme/tokens', {
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
});

const probeHost = 'Probe' as unknown as ElementType;
const Probe = ({ value }: { value: unknown }) => createElement(probeHost, { value });

type HarnessProps = {
  color: string;
  reducedMotion?: boolean;
  role: 'instant' | 'interaction' | 'selection';
};

let useAnimatedColorTransition: typeof AnimatedColorTransitionModule.useAnimatedColorTransition;

beforeEach(async () => {
  timingCalls.length = 0;
  if (!useAnimatedColorTransition) {
    ({ useAnimatedColorTransition } = await import('./useAnimatedColorTransition'));
  }
});

function Harness({ color, reducedMotion = false, role }: HarnessProps) {
  const value = useAnimatedColorTransition({
    color,
    instantKey: themeKey,
    reducedMotion,
    role,
  });
  return createElement(Probe, { value });
}

function renderHarness(props: HarnessProps): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Harness, props));
  });
  return renderer;
}

function probeValue(renderer: ReactTestRenderer): unknown {
  return renderer.root.findByType(probeHost).props.value;
}

test('selects 120ms for interaction changes and 200ms for selection changes', () => {
  const renderer = renderHarness({ color: 'hover', role: 'interaction' });

  act(() => {
    renderer.update(createElement(Harness, { color: 'pressed', role: 'interaction' }));
  });
  assert.equal(timingCalls.at(-1)?.duration, 120);
  assert.equal(timingCalls.at(-1)?.useNativeDriver, false);

  timingCalls.length = 0;
  const selectionRenderer = renderHarness({ color: 'selected', role: 'selection' });
  act(() => {
    selectionRenderer.update(createElement(Harness, { color: 'unselected', role: 'selection' }));
  });
  assert.equal(timingCalls.at(-1)?.duration, 200);
  assert.equal(timingCalls.at(-1)?.useNativeDriver, false);
});

test('retargets the same Animated color from its current presentation to the latest value', () => {
  const renderer = renderHarness({ color: 'base', role: 'selection' });
  act(() => {
    renderer.update(createElement(Harness, { color: 'first', role: 'selection' }));
  });
  const firstCall = timingCalls.at(-1);
  assert.ok(firstCall);
  firstCall.handle.setValue('midpoint');

  act(() => {
    renderer.update(createElement(Harness, { color: 'latest', role: 'selection' }));
  });

  const secondCall = timingCalls.at(-1);
  assert.ok(secondCall);
  assert.equal(secondCall.handle, firstCall.handle);
  assert.equal(secondCall.toValue.value, 'latest');
  assert.ok(firstCall.handle.stopCalls >= 2);
});

test('does not restart when only the hidden color role changes at the same target', () => {
  const renderer = renderHarness({ color: 'hover', role: 'interaction' });
  act(() => {
    renderer.update(createElement(Harness, { color: 'pressed', role: 'interaction' }));
  });
  const callCount = timingCalls.length;

  act(() => {
    renderer.update(createElement(Harness, { color: 'pressed', role: 'selection' }));
  });

  assert.equal(timingCalls.length, callCount);
});

test('stops and commits immediately when an instant role replaces an active target', () => {
  const renderer = renderHarness({ color: 'selected', role: 'selection' });
  act(() => {
    renderer.update(createElement(Harness, { color: 'next', role: 'selection' }));
  });
  const handle = timingCalls.at(-1)?.handle;
  assert.ok(handle);
  handle.setValue('midpoint');
  const callCount = timingCalls.length;

  act(() => {
    renderer.update(createElement(Harness, { color: 'next', role: 'instant' }));
  });

  assert.equal(timingCalls.length, callCount);
  assert.equal(handle.value, 'next');
  assert.ok(handle.stopCalls >= 2);
});

test('instant and reduced transitions stop the active handle and set the latest endpoint', () => {
  const renderer = renderHarness({ color: 'base', role: 'selection' });
  act(() => {
    renderer.update(createElement(Harness, { color: 'selected', role: 'selection' }));
  });
  const handle = timingCalls.at(-1)?.handle;
  assert.ok(handle);

  act(() => {
    renderer.update(createElement(Harness, { color: 'disabled', role: 'instant' }));
  });
  assert.equal(timingCalls.length, 1);
  assert.equal(handle.value, 'disabled');

  act(() => {
    renderer.update(
      createElement(Harness, { color: 'reduced', reducedMotion: true, role: 'selection' }),
    );
  });
  assert.equal(timingCalls.length, 1);
  assert.equal(handle.value, 'reduced');
  assert.ok(handle.stopCalls >= 4);
  assert.equal(probeValue(renderer), 'reduced');
});

test('passes numeric RGBA endpoints without allocating tracking color channels', () => {
  const renderer = renderHarness({ color: 'base', role: 'selection' });
  act(() => renderer.update(createElement(Harness, { color: '#4080c080', role: 'selection' })));
  assert.deepEqual(timingCalls.at(-1)?.toValue, { r: 64, g: 128, b: 192, a: 128 / 255 });
});
