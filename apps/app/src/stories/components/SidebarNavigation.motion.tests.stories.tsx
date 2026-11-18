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

  await fireEvent.click(search);
  expect(search).toHaveAttribute('aria-current', 'page');
  expect(home).not.toHaveAttribute('aria-current');

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

  await fireEvent.click(home);
  expect(home).toHaveAttribute('aria-current', 'page');
  expect(search).not.toHaveAttribute('aria-current');

  const returnSamples: string[] = [];
  const returnStart = performance.now();
  do {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    returnSamples.push(getComputedStyle(searchFeedback).backgroundColor);
  } while (performance.now() - returnStart < 260);
  expect(
    returnSamples.some((color) => color !== idleBackground && color !== selectedBackground),
  ).toBe(true);
  expect(getComputedStyle(homeFeedback).backgroundColor).toBe(selectedBackground);
  expect(getComputedStyle(searchFeedback).backgroundColor).toBe(idleBackground);
};

export const Light: Story = { globals: { theme: 'light' }, play: selectionContract };
export const Dark: Story = { globals: { theme: 'dark' }, play: selectionContract };
