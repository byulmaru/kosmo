import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { BottomTabBar } from '@/components/ui/BottomTabBar';
import { ThemeProvider, useThemeMode } from '@/theme/ThemeProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { BottomTabDestination } from '@/components/ui/navigationChrome';

function MotionContract() {
  const mode = useThemeMode();
  const [destination, setDestination] = useState<BottomTabDestination>('home');
  const [reducedMotion, setReducedMotion] = useState(false);
  return (
    <ThemeProvider mode={mode} reduceMotion={reducedMotion}>
      <div style={{ width: 390 }}>
        <BottomTabBar
          currentDestination={destination}
          onNavigate={setDestination}
          profile={{ label: '프로필' }}
        />
        <button onClick={() => setReducedMotion(true)} type="button">
          모션 줄이기
        </button>
      </div>
    </ThemeProvider>
  );
}

const meta = {
  tags: ['motion'],
  component: MotionContract,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Bottom Tab Bar/Tests/Motion',
} satisfies Meta<typeof MotionContract>;
export default meta;
type Story = StoryObj<typeof meta>;

async function sampleFrames(read: () => string, duration = 260) {
  const samples: string[] = [];
  const start = performance.now();
  do {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    samples.push(read());
  } while (performance.now() - start < duration);
  return samples;
}

const selectionContract: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const home = canvas.getByRole('button', { name: '홈' });
  const search = canvas.getByRole('button', { name: '검색' });
  const homeLabel = within(home).getByText('홈');
  const searchLabel = within(search).getByText('검색');
  const selectedColor = getComputedStyle(homeLabel).color;
  const idleColor = getComputedStyle(searchLabel).color;

  await userEvent.click(search);
  expect(search).toHaveAttribute('aria-current', 'page');
  expect(home).not.toHaveAttribute('aria-current');
  const filledIcon = within(search).getByTestId('bottom-tab-search-filled-icon');
  const path = filledIcon.querySelector('path');
  expect(path).not.toBeNull();
  const samples = await sampleFrames(() => getComputedStyle(searchLabel).color);
  expect(samples.some((color) => color !== idleColor && color !== selectedColor)).toBe(true);
  expect(getComputedStyle(searchLabel).color).toBe(selectedColor);
  expect(getComputedStyle(homeLabel).color).toBe(idleColor);
  expect(getComputedStyle(path!).fill).toBe(selectedColor);
  const outline = within(home).getByTestId('bottom-tab-home-outline-icon').querySelector('svg');
  expect(outline).not.toBeNull();
  expect(getComputedStyle(outline!).stroke).toBe(idleColor);

  // Reversing before the 200ms selection transition ends must settle on the latest selection.
  await userEvent.click(home);
  await userEvent.click(search);
  expect(search).toHaveAttribute('aria-current', 'page');
  await waitFor(() => expect(getComputedStyle(searchLabel).color).toBe(selectedColor));
  await waitFor(() => expect(getComputedStyle(homeLabel).color).toBe(idleColor));

  await userEvent.click(home);
  await userEvent.click(canvas.getByRole('button', { name: '모션 줄이기' }));
  expect(home).toHaveAttribute('aria-current', 'page');
  expect(getComputedStyle(homeLabel).color).toBe(selectedColor);
  expect(getComputedStyle(searchLabel).color).toBe(idleColor);
  const reducedSamples = await sampleFrames(() => getComputedStyle(homeLabel).color);
  expect(reducedSamples.every((color) => color === selectedColor)).toBe(true);
};

export const Light: Story = { globals: { theme: 'light' }, play: selectionContract };
export const Dark: Story = { globals: { theme: 'dark' }, play: selectionContract };
