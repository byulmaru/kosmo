import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Tab, TabList } from '@/components/ui/Tabs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TabOption, TabVariant } from '@/components/ui/Tabs';

type TabValue = 'latest' | 'media' | 'popular';

const options = [
  { label: '인기', value: 'popular' },
  { disabled: true, label: '최신', value: 'latest' },
  { label: '미디어', value: 'media' },
] satisfies readonly TabOption<TabValue>[];

const onValueChange = fn();

function TabsCatalog({ variant = 'underline' }: { variant?: TabVariant }) {
  const [value, setValue] = useState<TabValue>('popular');

  return (
    <TabList
      accessibilityLabel="검색 결과 유형"
      onValueChange={(nextValue) => {
        onValueChange(nextValue);
        setValue(nextValue);
      }}
      value={value}
      variant={variant}
    >
      {options.map((option) => (
        <Tab key={option.value} option={option} />
      ))}
    </TabList>
  );
}

const meta = {
  component: TabsCatalog,
  excludeStories: ['InteractionContract'],
  title: 'KOSMO/Components/Tabs',
} satisfies Meta<typeof TabsCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('tablist', { name: '검색 결과 유형' });
    const popular = within(group).getByRole('tab', { name: '인기' });
    const latest = within(group).getByRole('tab', { name: '최신' });
    const media = within(group).getByRole('tab', { name: '미디어' });
    const popularLabel = within(popular).getByText('인기');
    const indicator = popular.lastElementChild;

    expect(group).toHaveStyle({
      borderBottomColor: 'rgb(236, 236, 240)',
      borderBottomWidth: '1px',
    });
    expect(getComputedStyle(popular).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(popular).toHaveAttribute('aria-selected', 'true');
    expect(popular).toHaveAttribute('tabindex', '0');
    expect(popularLabel).toHaveStyle({
      fontFamily: 'SUIT',
      fontSize: '14px',
      fontWeight: '600',
      lineHeight: '20px',
    });
    expect(indicator).not.toBeNull();
    expect(getComputedStyle(indicator as Element).backgroundColor).toBe('rgb(255, 229, 151)');
    expect(indicator).toHaveStyle({ height: '4px', width: '64px' });
    expect(latest).toHaveAttribute('aria-disabled', 'true');
    expect(latest).toHaveAttribute('tabindex', '-1');
    expect(latest).toHaveStyle({ opacity: '0.45' });
    expect(media).toHaveAttribute('tabindex', '-1');

    await userEvent.tab();
    expect(popular).toHaveFocus();
    expect(getComputedStyle(popular).outlineWidth).toBe('2px');

    await userEvent.keyboard('{ArrowRight}');
    expect(media).toHaveFocus();
    expect(media).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard(' ');
    expect(media).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Home}');
    expect(popular).toHaveFocus();
    expect(popular).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{End}');
    expect(media).toHaveFocus();
    expect(media).toHaveAttribute('aria-selected', 'true');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{ArrowLeft}');
    expect(popular).toHaveFocus();
    expect(popular).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{Enter}');
    expect(popular).toHaveAttribute('aria-selected', 'true');
    expect(getComputedStyle(popular).outlineWidth).toBe('2px');
    expect(onValueChange).toHaveBeenCalledTimes(2);

    await userEvent.pointer({ keys: '[MouseLeft>]', target: media });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getComputedStyle(media).opacity).toBe('0.85');
    await userEvent.click(media);
    expect(media).toHaveFocus();
    expect(media).toHaveAttribute('aria-selected', 'true');
    expect(getComputedStyle(media).outlineWidth).not.toBe('2px');
    expect(onValueChange).toHaveBeenCalledTimes(3);
  },
};

export const PillVariant: Story = {
  args: { variant: 'pill' },
  play: async ({ canvasElement }) => {
    onValueChange.mockClear();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('tablist', { name: '검색 결과 유형' });
    const popular = within(group).getByRole('tab', { name: '인기' });
    const latest = within(group).getByRole('tab', { name: '최신' });

    expect(popular).toHaveAttribute('aria-selected', 'true');
    expect(popular).toHaveStyle({ borderRadius: '8px', height: '32px' });
    expect(getComputedStyle(popular).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(popular).borderColor).toBe('rgb(252, 231, 154)');
    expect(latest).toHaveAttribute('aria-disabled', 'true');
    expect(latest).toHaveStyle({ opacity: '0.45' });

    await userEvent.tab();
    expect(popular).toHaveFocus();
    expect(getComputedStyle(popular).outlineWidth).toBe('2px');
    expect(getComputedStyle(popular).outlineOffset).toBe('-2px');

    await userEvent.pointer({ keys: '[MouseLeft>]', target: popular });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getComputedStyle(popular).opacity).toBe('0.85');
    await userEvent.click(popular);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith('popular');

    expect(getComputedStyle(latest).pointerEvents).toBe('none');
    latest.click();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  },
};
