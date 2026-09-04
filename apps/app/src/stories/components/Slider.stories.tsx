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

function snapSliderValue(value: number, min: number, max: number, step: number) {
  const bounded = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((bounded - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(10));
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
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    args.onValueChange?.mockClear();
    args.onValueCommit?.mockClear();
    const canvas = within(canvasElement);
    const slider = canvas.getByRole('slider', { name: args.accessibilityLabel ?? '글씨 크기' });
    const min = args.min ?? 0;
    const safeMax = Math.max(min, args.max ?? 100);
    const positiveStep = args.step && args.step > 0 ? args.step : 1;
    let expectedControlledValue = snapSliderValue(args.value ?? 40, min, safeMax, positiveStep);

    await step('슬라이더 의미와 초기 값 확인', async () => {
      expect(slider).toHaveAttribute('aria-valuemin', String(min));
      expect(slider).toHaveAttribute('aria-valuemax', String(safeMax));
      expect(Number(slider.getAttribute('aria-valuenow'))).toBe(expectedControlledValue);
      expect(expectedControlledValue).toBeGreaterThanOrEqual(min);
      expect(expectedControlledValue).toBeLessThanOrEqual(safeMax);
      expect(slider).toHaveAttribute('tabindex', args.disabled ? '-1' : '0');
      if (args.disabled) {
        expect(slider).toHaveAttribute('aria-disabled', 'true');
        return;
      }
      expect(slider).not.toHaveAttribute('aria-disabled');
      await userEvent.tab();
      expect(slider).toHaveFocus();
      expect(getComputedStyle(slider).outlineWidth).toBe('2px');
    });

    if (args.disabled) {
      return;
    }

    await step('포인터 drag 중 change, release 후 commit 확인', async () => {
      args.onValueChange?.mockClear();
      args.onValueCommit?.mockClear();
      const rect = slider.getBoundingClientRect();
      const usableWidth = Math.max(0, rect.width - 24);
      const pointAt = (ratio: number) => ({
        x: rect.left + 12 + usableWidth * ratio,
        y: rect.top + rect.height / 2,
      });
      const expectedStart = snapSliderValue(
        min + (safeMax - min) * 0.2,
        min,
        safeMax,
        positiveStep,
      );
      const expectedEnd = snapSliderValue(min + (safeMax - min) * 0.8, min, safeMax, positiveStep);
      const initialValue = expectedControlledValue;
      const expectedChangeCount =
        Number(expectedStart !== initialValue) + Number(expectedEnd !== expectedStart);

      await userEvent.pointer({
        coords: pointAt(0.2),
        keys: '[MouseLeft>]',
        target: slider,
      });
      if (expectedStart !== initialValue) {
        expect(args.onValueChange).toHaveBeenLastCalledWith(expectedStart);
      } else {
        expect(args.onValueChange).not.toHaveBeenCalled();
      }
      expect(args.onValueCommit).not.toHaveBeenCalled();
      expectedControlledValue = expectedStart;

      await userEvent.pointer({ coords: pointAt(0.8), target: slider });
      if (expectedEnd !== expectedStart) {
        expect(args.onValueChange).toHaveBeenLastCalledWith(expectedEnd);
      }
      expect(args.onValueCommit).not.toHaveBeenCalled();

      fireEvent.pointerUp(slider);
      if (expectedEnd !== initialValue) {
        expect(args.onValueCommit).toHaveBeenCalledOnce();
        expect(args.onValueCommit).toHaveBeenLastCalledWith(expectedEnd);
      } else {
        expect(args.onValueCommit).not.toHaveBeenCalled();
      }
      expect(args.onValueChange).toHaveBeenCalledTimes(expectedChangeCount);
      expectedControlledValue = expectedEnd;
    });

    await step('키보드 값 변경과 change/commit Actions 확인', async () => {
      args.onValueChange?.mockClear();
      args.onValueCommit?.mockClear();
      await userEvent.keyboard('{ArrowRight}');
      const expectedNext = snapSliderValue(
        expectedControlledValue + positiveStep,
        min,
        safeMax,
        positiveStep,
      );
      expect(slider).toHaveAttribute('aria-valuenow', String(expectedNext));
      if (expectedNext !== expectedControlledValue) {
        expect(args.onValueChange).toHaveBeenLastCalledWith(expectedNext);
        expect(args.onValueCommit).toHaveBeenLastCalledWith(expectedNext);
      }
      expectedControlledValue = expectedNext;

      const beforeHome = Number(slider.getAttribute('aria-valuenow'));
      await userEvent.keyboard('{Home}');
      expect(slider).toHaveAttribute('aria-valuenow', String(min));
      if (beforeHome !== min) {
        expect(args.onValueChange).toHaveBeenLastCalledWith(min);
        expect(args.onValueCommit).toHaveBeenLastCalledWith(min);
      }
      expectedControlledValue = min;
      const beforeEnd = Number(slider.getAttribute('aria-valuenow'));
      await userEvent.keyboard('{End}');
      expect(slider).toHaveAttribute('aria-valuenow', String(safeMax));
      if (beforeEnd !== safeMax) {
        expect(args.onValueChange).toHaveBeenLastCalledWith(safeMax);
        expect(args.onValueCommit).toHaveBeenLastCalledWith(safeMax);
      }
      expectedControlledValue = safeMax;
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
