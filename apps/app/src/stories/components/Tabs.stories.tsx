import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Tab, TabList } from '@/components/ui/Tabs';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TabOption, TabVariant } from '@/components/ui/Tabs';

type TabValue = 'latest' | 'media' | 'popular';

function TabsCatalog({
  latestLabel = '최신',
  mediaLabel = '미디어',
  onValueChange,
  popularLabel = '인기',
  variant = 'underline',
}: {
  latestLabel?: string;
  mediaLabel?: string;
  onValueChange?: (value: TabValue) => void;
  popularLabel?: string;
  variant?: TabVariant;
}) {
  const [value, setValue] = useState<TabValue>('popular');
  const options = [
    { label: popularLabel, value: 'popular' },
    { disabled: true, label: latestLabel, value: 'latest' },
    { label: mediaLabel, value: 'media' },
  ] satisfies readonly TabOption<TabValue>[];

  return (
    <TabList
      accessibilityLabel="검색 결과 유형"
      onValueChange={(nextValue) => {
        onValueChange?.(nextValue);
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
  args: {
    latestLabel: '최신',
    mediaLabel: '미디어',
    onValueChange: fn(),
    popularLabel: '인기',
  },
  argTypes: {
    variant: { control: 'select', options: ['underline', 'pill'] },
  },
  component: TabsCatalog,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Tabs',
} satisfies Meta<typeof TabsCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['popularLabel', 'latestLabel', 'mediaLabel', 'variant'],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onValueChange?.mockClear();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('tablist', { name: '검색 결과 유형' });
    const popularText = args.popularLabel ?? '인기';
    const latestText = args.latestLabel ?? '최신';
    const mediaText = args.mediaLabel ?? '미디어';
    const popular = within(group).getByRole('tab', { name: popularText });
    const latest = within(group).getByRole('tab', { name: latestText });
    const media = within(group).getByRole('tab', { name: mediaText });
    const popularLabel = within(popular).getByText(popularText);
    const indicator = popular.lastElementChild;

    await step('기본 상태와 접근성 확인', async () => {
      expect(popular).toHaveAttribute('aria-selected', 'true');
      expect(popular).toHaveAttribute('tabindex', '0');
      expect(latest).toHaveAttribute('aria-disabled', 'true');
      expect(latest).toHaveAttribute('tabindex', '-1');
      expect(latest).toHaveStyle({ opacity: '0.45' });
      expect(media).toHaveAttribute('tabindex', '-1');
      if (args.variant === 'pill') {
        expect(popular).toHaveStyle({ borderRadius: '8px', height: '32px' });
        expect(getComputedStyle(popular).backgroundColor).toBe('rgb(255, 255, 255)');
        expect(getComputedStyle(popular).borderColor).toBe('rgb(252, 231, 154)');
      } else {
        expect(group).toHaveStyle({
          borderBottomColor: 'rgb(236, 236, 240)',
          borderBottomWidth: '1px',
        });
        expect(getComputedStyle(popular).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(popularLabel).toHaveStyle({
          fontFamily: 'SUIT',
          fontSize: '14px',
          fontWeight: '600',
          lineHeight: '20px',
        });
        expect(indicator).not.toBeNull();
        expect(getComputedStyle(indicator as Element).backgroundColor).toBe('rgb(255, 229, 151)');
        expect(indicator).toHaveStyle({ height: '4px', width: '64px' });
      }

      await userEvent.tab();
      expect(popular).toHaveFocus();
      expect(getComputedStyle(popular).outlineWidth).toBe('2px');
    });

    await step('키보드로 탭 선택 변경', async () => {
      await userEvent.keyboard('{ArrowRight}');
      expect(media).toHaveFocus();
      expect(media).toHaveAttribute('aria-selected', 'false');
      await userEvent.keyboard(' ');
      expect(media).toHaveAttribute('aria-selected', 'true');
      expect(args.onValueChange).toHaveBeenCalledTimes(1);

      await userEvent.keyboard('{Home}');
      expect(popular).toHaveFocus();
      expect(popular).toHaveAttribute('aria-selected', 'false');
      await userEvent.keyboard('{End}');
      expect(media).toHaveFocus();
      expect(media).toHaveAttribute('aria-selected', 'true');
      expect(args.onValueChange).toHaveBeenCalledTimes(1);
      await userEvent.keyboard('{ArrowLeft}');
      expect(popular).toHaveFocus();
      expect(popular).toHaveAttribute('aria-selected', 'false');
      await userEvent.keyboard('{Enter}');
      expect(popular).toHaveAttribute('aria-selected', 'true');
      expect(getComputedStyle(popular).outlineWidth).toBe('2px');
      expect(args.onValueChange).toHaveBeenCalledTimes(2);
    });

    await step('포인터 선택과 hover 상태 확인', async () => {
      await userEvent.pointer({ keys: '[MouseLeft>]', target: media });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(getComputedStyle(media).opacity).toBe('0.85');
      await userEvent.click(media);
      expect(media).toHaveFocus();
      expect(media).toHaveAttribute('aria-selected', 'true');
      expect(getComputedStyle(media).outlineWidth).not.toBe('2px');
      expect(args.onValueChange).toHaveBeenCalledTimes(3);
    });
  },
};

export const PillVariant: Story = {
  args: { variant: 'pill' },
  play: async ({ args, canvasElement, step }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('tablist', { name: '검색 결과 유형' });
    const popular = within(group).getByRole('tab', { name: '인기' });
    const latest = within(group).getByRole('tab', { name: '최신' });

    await step('Pill 상태와 포커스 확인', async () => {
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
    });

    await step('Pill 탭 선택과 비활성 상태 확인', async () => {
      await userEvent.pointer({ keys: '[MouseLeft>]', target: popular });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(getComputedStyle(popular).opacity).toBe('0.85');
      await userEvent.click(popular);
      expect(args.onValueChange).toHaveBeenCalledTimes(1);
      expect(args.onValueChange).toHaveBeenLastCalledWith('popular');

      expect(getComputedStyle(latest).pointerEvents).toBe('none');
      latest.click();
      expect(args.onValueChange).toHaveBeenCalledTimes(1);
    });
  },
};
