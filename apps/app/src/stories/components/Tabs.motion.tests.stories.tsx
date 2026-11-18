import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Tab, TabList } from '@/components/ui/Tabs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TabOption } from '@/components/ui/Tabs';

type TabValue = 'first' | 'second';

const options = [
  { label: '첫째', value: 'first' },
  { label: '둘째', value: 'second' },
] as const satisfies readonly TabOption<TabValue>[];

function UnderlineTabsMotion() {
  const [value, setValue] = useState<TabValue>('first');

  return (
    <div style={{ width: 320 }}>
      <TabList
        accessibilityLabel="움직임 확인"
        onValueChange={setValue}
        value={value}
        variant="underline"
      >
        {options.map((option) => (
          <Tab key={option.value} option={option} />
        ))}
      </TabList>
    </div>
  );
}

const meta = {
  tags: ['motion'],
  component: UnderlineTabsMotion,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Tabs/Tests/Motion',
} satisfies Meta<typeof UnderlineTabsMotion>;
export default meta;
type Story = StoryObj<typeof meta>;

async function sampleIndicator(indicator: HTMLElement, duration: number) {
  const samples: DOMRect[] = [];
  const start = performance.now();
  do {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    samples.push(indicator.getBoundingClientRect());
  } while (performance.now() - start < duration);
  return samples;
}

export const UnderlineSelectionTransition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('tablist', { name: '움직임 확인' });
    const first = within(group).getByRole('tab', { name: '첫째' });
    const second = within(group).getByRole('tab', { name: '둘째' });
    const indicator = await waitFor(() => {
      const bottom =
        group.getBoundingClientRect().bottom -
        parseFloat(getComputedStyle(group).borderBottomWidth);
      const underline = Array.from(group.querySelectorAll<HTMLElement>('*')).find((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.height === 4 && bounds.width > 0 && Math.abs(bounds.bottom - bottom) < 1;
      });
      expect(underline).toBeDefined();
      return underline!;
    });
    const initialIndicator = indicator.getBoundingClientRect();
    const firstTab = first.getBoundingClientRect();
    expect(
      Math.abs(
        initialIndicator.left + initialIndicator.width / 2 - (firstTab.left + firstTab.width / 2),
      ),
    ).toBeLessThan(1);

    const [samples] = await Promise.all([sampleIndicator(indicator, 260), userEvent.click(second)]);
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(samples.some((sample) => sample.width > initialIndicator.width + 8)).toBe(true);

    await waitFor(() => {
      const finalIndicator = indicator.getBoundingClientRect();
      const selectedTab = second.getBoundingClientRect();
      expect(finalIndicator.width).toBeCloseTo(initialIndicator.width, 0);
      expect(
        Math.abs(
          finalIndicator.left +
            finalIndicator.width / 2 -
            (selectedTab.left + selectedTab.width / 2),
        ),
      ).toBeLessThan(1);
    });
  },
};
