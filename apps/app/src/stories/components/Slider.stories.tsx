import { useState } from 'react';
import { View } from 'react-native';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { Slider } from '@/components/ui/Slider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SliderProps } from '@/components/ui/Slider';

function SliderCatalog({
  accessibilityLabel = '글씨 크기',
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  onValueCommit,
  step = 10,
  value = 40,
}: Omit<SliderProps, 'onValueChange'> & {
  onValueChange?: SliderProps['onValueChange'];
}) {
  const [currentValue, setCurrentValue] = useState(value);

  return (
    <View style={{ gap: 8, maxWidth: 480, padding: 16, width: '100%' }}>
      <Slider
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={(nextValue) => {
          setCurrentValue(nextValue);
          onValueChange?.(nextValue);
        }}
        onValueCommit={onValueCommit}
        step={step}
        value={currentValue}
      />
    </View>
  );
}

const meta = {
  args: {
    accessibilityLabel: '글씨 크기',
    disabled: false,
    max: 100,
    min: 0,
    onValueChange: fn(),
    onValueCommit: fn(),
    step: 10,
    value: 40,
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    disabled: { control: 'boolean' },
    max: { control: { max: 1000, min: 1, step: 1, type: 'number' } },
    min: { control: { max: 999, min: 0, step: 1, type: 'number' } },
    step: { control: { max: 100, min: 1, step: 1, type: 'number' } },
    value: { control: { max: 100, min: 0, step: 1, type: 'number' } },
  },
  component: Slider,
  excludeStories: ['InteractionContract', 'ReducedMotionContract'],
  parameters: { controls: { disable: true } },
  render: (args) => <SliderCatalog {...args} />,
  title: 'KOSMO/Components/Slider',
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['accessibilityLabel', 'disabled', 'max', 'min', 'step', 'value'],
    },
  },
  render: (args) => (
    <SliderCatalog
      key={`${args.accessibilityLabel}:${args.disabled}:${args.max}:${args.min}:${args.step}:${args.value}`}
      {...args}
    />
  ),
};

export const InteractionContract: Story = {
  ...Playground,
  args: { disabled: false, min: 0, max: 100, step: 10, value: 40 },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    args.onValueChange?.mockClear();
    args.onValueCommit?.mockClear();
    const slider = within(canvasElement).getByRole('slider', {
      name: args.accessibilityLabel ?? '글씨 크기',
    });

    await step('슬라이더 의미와 초기 값 확인', async () => {
      expect(slider).toHaveAttribute('aria-valuemin', '0');
      expect(slider).toHaveAttribute('aria-valuemax', '100');
      expect(slider).toHaveAttribute('aria-valuenow', '40');
      expect(slider).toHaveAttribute('tabindex', '0');
      expect(slider).not.toHaveAttribute('aria-disabled');
      await userEvent.tab();
      expect(slider).toHaveFocus();
      expect(getComputedStyle(slider).outlineWidth).toBe('2px');
    });

    await step('포인터 drag 중 change, release 후 commit 확인', async () => {
      const rect = slider.getBoundingClientRect();
      const pointAt = (ratio: number) => ({
        x: rect.left + 12 + (rect.width - 24) * ratio,
        y: rect.top + rect.height / 2,
      });

      await userEvent.pointer({
        coords: pointAt(0.2),
        keys: '[MouseLeft>]',
        target: slider,
      });
      expect(slider).toHaveAttribute('aria-valuenow', '20');
      expect(args.onValueChange).toHaveBeenLastCalledWith(20);
      expect(args.onValueCommit).not.toHaveBeenCalled();

      await userEvent.pointer({ coords: pointAt(0.8), target: slider });
      expect(slider).toHaveAttribute('aria-valuenow', '80');
      expect(args.onValueChange).toHaveBeenLastCalledWith(80);
      expect(args.onValueCommit).not.toHaveBeenCalled();

      fireEvent.pointerUp(slider, { pointerId: 1 });
      expect(args.onValueCommit).toHaveBeenCalledOnce();
      expect(args.onValueCommit).toHaveBeenLastCalledWith(80);
      expect(args.onValueChange).toHaveBeenCalledTimes(2);
    });

    await step('키보드 값 변경과 change/commit Actions 확인', async () => {
      args.onValueChange?.mockClear();
      args.onValueCommit?.mockClear();
      await userEvent.keyboard('{ArrowRight}');
      expect(slider).toHaveAttribute('aria-valuenow', '90');
      expect(args.onValueChange).toHaveBeenLastCalledWith(90);
      expect(args.onValueCommit).toHaveBeenLastCalledWith(90);

      await userEvent.keyboard('{Home}');
      expect(slider).toHaveAttribute('aria-valuenow', '0');
      expect(args.onValueChange).toHaveBeenLastCalledWith(0);
      expect(args.onValueCommit).toHaveBeenLastCalledWith(0);

      await userEvent.keyboard('{End}');
      expect(slider).toHaveAttribute('aria-valuenow', '100');
      expect(args.onValueChange).toHaveBeenLastCalledWith(100);
      expect(args.onValueCommit).toHaveBeenLastCalledWith(100);
    });
  },
};

export const ReducedMotionContract: Story = {
  ...Playground,
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', {
      name: args.accessibilityLabel ?? '글씨 크기',
    });
    expect(getComputedStyle(slider).transitionDuration).toBe('0s');
  },
};

export const VisualStates: Story = {
  render: () => (
    <View style={{ gap: 8, maxWidth: 480, padding: 16, width: '100%' }}>
      {[0, 25, 50, 75, 100].map((value) => (
        <Slider
          key={value}
          accessibilityLabel={`슬라이더 값 ${value}`}
          max={100}
          onValueChange={() => undefined}
          onValueCommit={() => undefined}
          value={value}
        />
      ))}
      <Slider
        accessibilityLabel="슬라이더 비활성"
        disabled
        max={100}
        onValueChange={() => undefined}
        onValueCommit={() => undefined}
        value={50}
      />
    </View>
  ),
};
