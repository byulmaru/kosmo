import { expect, userEvent, within } from 'storybook/test';
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
  const selectedColor = getComputedStyle(homeLabel).color;
  const idleColor = getComputedStyle(searchLabel).color;
  await userEvent.click(search);
  expect(search).toHaveAttribute('aria-current', 'page');
  expect(home).not.toHaveAttribute('aria-current');

  const samples: string[] = [];
  const start = performance.now();
  do {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    samples.push(getComputedStyle(searchLabel).color);
  } while (performance.now() - start < 260);
  expect(samples.some((color) => color !== idleColor && color !== selectedColor)).toBe(true);
  expect(getComputedStyle(searchLabel).color).toBe(selectedColor);
  expect(getComputedStyle(homeLabel).color).toBe(idleColor);
  const searchIcon = search.querySelector('svg');
  const homeIcon = home.querySelector('svg');
  expect(searchIcon).not.toBeNull();
  expect(homeIcon).not.toBeNull();
  expect(getComputedStyle(searchIcon!).stroke).toBe(selectedColor);
  expect(getComputedStyle(homeIcon!).stroke).toBe(idleColor);
};

export const Light: Story = { globals: { theme: 'light' }, play: selectionContract };
export const Dark: Story = { globals: { theme: 'dark' }, play: selectionContract };
