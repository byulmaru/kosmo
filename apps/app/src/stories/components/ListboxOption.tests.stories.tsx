import { useState } from 'react';
import { expect, userEvent } from 'storybook/test';
import { ListboxOption } from '@/components/ui/ListboxOption';
import { ThemeProvider, useThemeMode } from '@/theme/ThemeProvider';
import baseMeta, {
  DisabledSelectionContract as disabledSelectionContract,
  EnabledSelectionContract as enabledSelectionContract,
  ReducedMotionContract as reducedMotionContract,
} from './ListboxOption.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListboxOptionProps } from '@/components/ui/ListboxOption';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Listbox Option/Tests',
} satisfies Meta<ListboxOptionProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnabledSelectionContract: Story = enabledSelectionContract;
export const DisabledSelectionContract: Story = disabledSelectionContract;
export const ReducedMotionContract: Story = reducedMotionContract;

function SelectionMotion() {
  const mode = useThemeMode();
  const [selected, setSelected] = useState(true);
  return (
    <ThemeProvider mode={mode} reduceMotion={false}>
      <div role="listbox" aria-label="항목 선택">
        <ListboxOption label="선택 항목" selected={selected} onSelect={() => setSelected(true)} />
      </div>
      <button onClick={() => setSelected(false)} type="button">
        선택 해제
      </button>
    </ThemeProvider>
  );
}

export const SelectionExitMotion: Story = {
  tags: ['motion'],
  render: () => <SelectionMotion />,
  play: async ({ canvasElement }) => {
    const option = canvasElement.querySelector('[role="option"]')!;
    const surface = option.firstElementChild!;
    const selectedBorder = getComputedStyle(surface).borderColor;
    await userEvent.click(canvasElement.querySelector('button')!);
    expect(option).toHaveAttribute('aria-selected', 'false');
    const colors: string[] = [];
    const start = performance.now();
    do {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(getComputedStyle(surface).borderWidth).toBe('1px');
      colors.push(getComputedStyle(surface).borderColor);
    } while (performance.now() - start < 260);
    const finalColor = getComputedStyle(surface).borderColor;
    expect(finalColor).toBe('rgba(0, 0, 0, 0)');
    expect(colors.some((color) => color !== selectedBorder && color !== finalColor)).toBe(true);
  },
};
