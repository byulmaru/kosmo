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

class AnimatedValueMock {
  stopCalls = 0;

  constructor(public value: number) {}

  setValue(value: number) {
    this.value = value;
  }

  stopAnimation() {
    this.stopCalls += 1;
  }
}

type TimingCall = {
  duration: number;
  handle: AnimatedColorMock;
  toValue: AnimatedColorMock;
  useNativeDriver: boolean;
};

type OpacityTimingCall = {
  duration: number;
  handle: AnimatedValueMock;
  toValue: number;
  useNativeDriver: boolean;
};

const timingCalls: TimingCall[] = [];
const opacityTimingCalls: OpacityTimingCall[] = [];
const themeKey = {};

mockModule('react-native', {
  processColor: (color: string) => (color === '#4080c080' ? 0x804080c0 : undefined),
  Animated: {
    Color: AnimatedColorMock,
    Value: AnimatedValueMock,
    timing: (
      handle: AnimatedColorMock | AnimatedValueMock,
      config: { duration: number; toValue: unknown; useNativeDriver: boolean },
    ) => {
      if (handle instanceof AnimatedValueMock) {
        opacityTimingCalls.push({
          duration: config.duration,
          handle,
          toValue: config.toValue as number,
          useNativeDriver: config.useNativeDriver,
        });
      } else {
        timingCalls.push({ handle, ...config } as TimingCall);
      }
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
  interactionKey?: unknown;
  instantKey?: unknown;
  reducedMotion?: boolean;
  role: 'instant' | 'interaction' | 'selection';
  selectionKey?: unknown;
};

let useAnimatedColorTransition: typeof AnimatedColorTransitionModule.useAnimatedColorTransition;
let useAnimatedOpacityTransition: typeof AnimatedColorTransitionModule.useAnimatedOpacityTransition;

beforeEach(async () => {
  timingCalls.length = 0;
  opacityTimingCalls.length = 0;
  if (!useAnimatedColorTransition) {
    ({ useAnimatedColorTransition, useAnimatedOpacityTransition } =
      await import('./useAnimatedColorTransition'));
  }
});

function Harness({
  color,
  interactionKey,
  instantKey = themeKey,
  reducedMotion = false,
  role,
  selectionKey,
}: HarnessProps) {
  const value = useAnimatedColorTransition({
    color,
    interactionKey,
    instantKey,
    reducedMotion,
    role,
    selectionKey,
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

test('uses selected timing when only selection changes under stable interaction', () => {
  const renderer = renderHarness({
    color: 'surface',
    interactionKey: 'idle',
    role: 'selection',
    selectionKey: false,
  });

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'surface',
        interactionKey: 'hovered',
        role: 'interaction',
        selectionKey: false,
      }),
    );
  });
  assert.equal(timingCalls.length, 0);

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'selected-hover',
        interactionKey: 'hovered',
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  assert.equal(timingCalls.at(-1)?.duration, 200);
  assert.equal(timingCalls.at(-1)?.toValue.value, 'selected-hover');

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'surface',
        interactionKey: 'hovered',
        role: 'interaction',
        selectionKey: false,
      }),
    );
  });
  assert.equal(timingCalls.at(-1)?.duration, 200);
  assert.equal(timingCalls.at(-1)?.toValue.value, 'surface');
});

test('keeps interaction timing when interaction changes with or without selection', () => {
  const renderer = renderHarness({
    color: 'primary',
    interactionKey: 'idle',
    role: 'selection',
    selectionKey: true,
  });

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'primary-hover',
        interactionKey: 'hovered',
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  assert.equal(timingCalls.at(-1)?.duration, 120);

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'primary-pressed',
        interactionKey: 'pressed',
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  assert.equal(timingCalls.at(-1)?.duration, 120);

  timingCalls.length = 0;
  const overlappingRenderer = renderHarness({
    color: 'surface',
    interactionKey: 'idle',
    role: 'selection',
    selectionKey: false,
  });
  act(() => {
    overlappingRenderer.update(
      createElement(Harness, {
        color: 'primary-hover',
        interactionKey: 'hovered',
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  assert.equal(timingCalls.at(-1)?.duration, 120);
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

test('theme changes and reduced motion commit selected color immediately', () => {
  const firstTheme = {};
  const secondTheme = {};
  const renderer = renderHarness({
    color: 'surface',
    interactionKey: 'hovered',
    instantKey: firstTheme,
    role: 'interaction',
    selectionKey: false,
  });
  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'selected-hover',
        interactionKey: 'hovered',
        instantKey: firstTheme,
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  const transition = timingCalls.at(-1);
  assert.ok(transition);
  assert.equal(transition.duration, 200);
  transition.handle.setValue('midpoint');
  const activeCallCount = timingCalls.length;

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'new-theme-selected',
        interactionKey: 'hovered',
        instantKey: secondTheme,
        role: 'interaction',
        selectionKey: true,
      }),
    );
  });
  assert.equal(timingCalls.length, activeCallCount);
  assert.equal(transition.handle.value, 'new-theme-selected');

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'unselected-hover',
        interactionKey: 'hovered',
        instantKey: secondTheme,
        role: 'interaction',
        selectionKey: false,
      }),
    );
  });
  const reducedTransition = timingCalls.at(-1);
  assert.ok(reducedTransition);
  assert.equal(reducedTransition.duration, 200);
  reducedTransition.handle.setValue('midpoint');
  const reducedCallCount = timingCalls.length;

  act(() => {
    renderer.update(
      createElement(Harness, {
        color: 'reduced-selected',
        interactionKey: 'hovered',
        instantKey: secondTheme,
        reducedMotion: true,
        role: 'interaction',
        selectionKey: false,
      }),
    );
  });
  assert.equal(timingCalls.length, reducedCallCount);
  assert.equal(reducedTransition.handle.value, 'reduced-selected');
  assert.equal(probeValue(renderer), 'reduced-selected');
});

test('passes numeric RGBA endpoints without allocating tracking color channels', () => {
  const renderer = renderHarness({ color: 'base', role: 'selection' });
  act(() => renderer.update(createElement(Harness, { color: '#4080c080', role: 'selection' })));
  assert.deepEqual(timingCalls.at(-1)?.toValue, { r: 64, g: 128, b: 192, a: 128 / 255 });
});

type OpacityHarnessProps = {
  instantKey?: unknown;
  interactionKey?: unknown;
  opacity: number;
  reducedMotion?: boolean;
  role: 'instant' | 'interaction' | 'selection';
  selectionKey?: unknown;
};

function OpacityHarness({
  instantKey = themeKey,
  interactionKey,
  opacity,
  reducedMotion = false,
  role,
  selectionKey,
}: OpacityHarnessProps) {
  const value = useAnimatedOpacityTransition({
    instantKey,
    interactionKey,
    opacity,
    reducedMotion,
    role,
    selectionKey,
  });
  return createElement(Probe, { value });
}

function renderOpacityHarness(props: OpacityHarnessProps): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(OpacityHarness, props));
  });
  return renderer;
}

test('animates opacity in both press directions and retargets the active handle', () => {
  const renderer = renderOpacityHarness({
    interactionKey: 'idle',
    opacity: 1,
    role: 'interaction',
  });

  act(() => {
    renderer.update(
      createElement(OpacityHarness, {
        interactionKey: 'pressed',
        opacity: 0.7,
        role: 'interaction',
      }),
    );
  });
  const press = opacityTimingCalls.at(-1);
  assert.ok(press);
  assert.equal(press.duration, 120);
  assert.equal(press.useNativeDriver, true);
  press.handle.setValue(0.82);

  act(() => {
    renderer.update(
      createElement(OpacityHarness, { interactionKey: 'idle', opacity: 1, role: 'interaction' }),
    );
  });
  const release = opacityTimingCalls.at(-1);
  assert.ok(release);
  assert.equal(release.duration, 120);
  assert.equal(release.handle, press.handle);
  assert.equal(release.toValue, 1);
  assert.ok(press.handle.stopCalls >= 2);
});

test('uses selected timing and commits the endpoint immediately for reduced motion', () => {
  const renderer = renderOpacityHarness({
    interactionKey: 'idle',
    opacity: 1,
    role: 'selection',
    selectionKey: false,
  });

  act(() => {
    renderer.update(
      createElement(OpacityHarness, {
        interactionKey: 'idle',
        opacity: 0.8,
        role: 'selection',
        selectionKey: true,
      }),
    );
  });
  const selected = opacityTimingCalls.at(-1);
  assert.ok(selected);
  assert.equal(selected.duration, 200);
  assert.equal(selected.useNativeDriver, true);
  selected.handle.setValue(0.9);
  const callCount = opacityTimingCalls.length;

  act(() => {
    renderer.update(
      createElement(OpacityHarness, {
        interactionKey: 'idle',
        opacity: 1,
        reducedMotion: true,
        role: 'selection',
        selectionKey: false,
      }),
    );
  });
  assert.equal(opacityTimingCalls.length, callCount);
  assert.equal(selected.handle.value, 1);
  assert.equal(renderer.root.findByType(probeHost).props.value, 1);
});
