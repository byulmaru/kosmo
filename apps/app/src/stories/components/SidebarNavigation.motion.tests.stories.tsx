import { Animated } from 'react-native';
import { expect, fireEvent, within } from 'storybook/test';
import baseMeta from './SidebarNavigation.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  tags: ['motion'],
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Components/Sidebar Navigation/Tests/Motion',
} satisfies Meta<typeof baseMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

type TimingCall = {
  duration?: number;
  handle: unknown;
  target: unknown;
};

function parseComputedColor(color: string) {
  const match = color.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/,
  );
  if (!match) {
    return color;
  }
  return {
    a: match[4] === undefined ? 1 : Number(match[4]),
    b: Number(match[3]),
    g: Number(match[2]),
    r: Number(match[1]),
  };
}

function matchesColorTarget(target: unknown, color: string) {
  const expected = parseComputedColor(color);
  if (target === color || expected === color) {
    return target === color;
  }
  if (!target || typeof target !== 'object' || typeof expected !== 'object') {
    return false;
  }
  const targetValue = target as { a?: number; b?: number; g?: number; r?: number; value?: unknown };
  if ('value' in targetValue) {
    return targetValue.value === color;
  }
  return (
    targetValue.r === expected.r &&
    targetValue.g === expected.g &&
    targetValue.b === expected.b &&
    targetValue.a === expected.a
  );
}

const selectionContract: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const home = canvas.getByRole('button', { name: /^홈$/ });
  const search = canvas.getByRole('button', { name: /^검색$/ });
  const homeLabel = within(home).getByText('홈');
  const searchLabel = within(search).getByText('검색');
  const homeFeedback = within(home).getByTestId('sidebar-control-feedback');
  const searchFeedback = within(search).getByTestId('sidebar-control-feedback');
  const selectedColor = getComputedStyle(homeLabel).color;
  const idleColor = getComputedStyle(searchLabel).color;
  const selectedBackground = getComputedStyle(homeFeedback).backgroundColor;
  const idleBackground = getComputedStyle(searchFeedback).backgroundColor;
  const timingCalls: TimingCall[] = [];
  const animated = Animated as unknown as {
    timing: typeof Animated.timing;
  };
  const originalTiming = animated.timing;
  animated.timing = ((value, config) => {
    const animation = originalTiming(value, config);
    timingCalls.push({
      duration: config.duration,
      handle: value,
      target: config.toValue,
    });
    return animation;
  }) as typeof Animated.timing;

  try {
    await fireEvent.click(search);
    expect(search).toHaveAttribute('aria-current', 'page');
    expect(home).not.toHaveAttribute('aria-current');

    const forwardSurfaceTiming = timingCalls.find(
      ({ duration, target }) => duration === 200 && matchesColorTarget(target, selectedBackground),
    );
    expect(forwardSurfaceTiming).toBeDefined();
    expect(forwardSurfaceTiming?.handle).toBeDefined();

    const searchSamples: string[] = [];
    const homeSamples: string[] = [];
    const searchLabelSamples: string[] = [];
    const start = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      searchSamples.push(getComputedStyle(searchFeedback).backgroundColor);
      homeSamples.push(getComputedStyle(homeFeedback).backgroundColor);
      searchLabelSamples.push(getComputedStyle(searchLabel).color);
    } while (performance.now() - start < 260);
    expect(
      searchSamples.some(
        (background) => background !== idleBackground && background !== selectedBackground,
      ),
    ).toBe(true);
    expect(
      homeSamples.some(
        (background) => background !== selectedBackground && background !== idleBackground,
      ),
    ).toBe(true);
    expect(searchLabelSamples.some((color) => color !== idleColor && color !== selectedColor)).toBe(
      true,
    );
    expect(getComputedStyle(searchFeedback).backgroundColor).toBe(selectedBackground);
    expect(getComputedStyle(homeFeedback).backgroundColor).toBe(idleBackground);
    expect(getComputedStyle(searchLabel).color).toBe(selectedColor);
    expect(getComputedStyle(homeLabel).color).toBe(idleColor);
    const searchIcon = search.querySelector('svg');
    const homeIcon = home.querySelector('svg');
    expect(searchIcon).not.toBeNull();
    expect(homeIcon).not.toBeNull();
    expect(getComputedStyle(searchIcon!).stroke).toBe(selectedColor);
    expect(getComputedStyle(homeIcon!).stroke).toBe(idleColor);

    timingCalls.length = 0;
    await fireEvent.click(home);
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(search).not.toHaveAttribute('aria-current');
    const homeReturnSamples: string[] = [];
    const searchReturnSamples: string[] = [];
    const returnStart = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      homeReturnSamples.push(getComputedStyle(homeFeedback).backgroundColor);
      searchReturnSamples.push(getComputedStyle(searchFeedback).backgroundColor);
    } while (performance.now() - returnStart < 260);
    const reverseSurfaceTiming = timingCalls.find(
      ({ duration, handle, target }) =>
        handle === forwardSurfaceTiming?.handle &&
        duration === 200 &&
        matchesColorTarget(target, idleBackground),
    );
    expect(reverseSurfaceTiming).toBeDefined();
    expect(reverseSurfaceTiming?.handle).toBeDefined();
    expect(
      homeReturnSamples.some(
        (background) => background !== idleBackground && background !== selectedBackground,
      ),
    ).toBe(true);
    expect(
      searchReturnSamples.some(
        (background) => background !== selectedBackground && background !== idleBackground,
      ),
    ).toBe(true);
    expect(getComputedStyle(homeFeedback).backgroundColor).toBe(selectedBackground);
    expect(getComputedStyle(searchFeedback).backgroundColor).toBe(idleBackground);
  } finally {
    animated.timing = originalTiming;
  }
};

export const Light: Story = { globals: { theme: 'light' }, play: selectionContract };
export const Dark: Story = { globals: { theme: 'dark' }, play: selectionContract };
