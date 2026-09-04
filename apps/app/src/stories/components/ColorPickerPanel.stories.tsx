import { useState } from 'react';
import { View } from 'react-native';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ColorPickerPanel } from '@/components/ui/ColorPickerPanel';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColorPickerPanelProps, ColorPickerValue } from '@/components/ui/ColorPickerPanel';

const initialValue: ColorPickerValue = { brightness: 76, hue: 210, saturation: 64 };

function ColorPickerPanelCatalog(props: ColorPickerPanelProps) {
  const [value, setValue] = useState(props.value);

  return (
    <ColorPickerPanel
      {...props}
      onChange={(nextValue) => {
        setValue(nextValue);
        props.onChange(nextValue);
      }}
      value={value}
    />
  );
}

const renderControlled = (args: ColorPickerPanelProps) => (
  <ColorPickerPanelCatalog
    key={JSON.stringify([
      args.title,
      args.value,
      args.contrastWarning,
      args.disabled,
      args.surfaceAccessibilityLabel,
      args.hueAccessibilityLabel,
      args.hexAccessibilityLabel,
    ])}
    {...args}
  />
);

function RepresentativeStatesStory() {
  const callbacks = {
    onCancel: fn(),
    onChange: fn(),
    onCommit: fn(),
  };

  return (
    <View style={{ gap: 16, width: 360 }}>
      <ColorPickerPanel
        {...callbacks}
        surfaceAccessibilityLabel="경고 없는 채도 및 밝기"
        title="색상 선택"
        value={initialValue}
      />
      <ColorPickerPanel
        {...callbacks}
        contrastWarning="이 색상은 일부 텍스트에서 대비가 낮을 수 있어요."
        disabled={false}
        title="대비 확인"
        value={{ brightness: 100, hue: 45, saturation: 100 }}
      />
      <ColorPickerPanel
        {...callbacks}
        disabled
        title="비활성 상태"
        value={{ brightness: 54.12, hue: 0, saturation: 0 }}
      />
    </View>
  );
}

const meta = {
  args: {
    contrastWarning: undefined,
    disabled: false,
    hexAccessibilityLabel: 'HEX 색상',
    hueAccessibilityLabel: '색상 색조',
    onCancel: fn(),
    onChange: fn(),
    onCommit: fn(),
    surfaceAccessibilityLabel: '채도 및 밝기',
    title: '색상 선택',
    value: initialValue,
  },
  argTypes: {
    contrastWarning: { control: 'text' },
    disabled: { control: 'boolean' },
    hexAccessibilityLabel: { control: 'text' },
    hueAccessibilityLabel: { control: 'text' },
    surfaceAccessibilityLabel: { control: 'text' },
    title: { control: 'text' },
    value: { control: 'object' },
  },
  component: ColorPickerPanel,
  decorators: [
    (Story) => (
      <View style={{ width: 360 }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: [
    'InteractionContract',
    'MidpointPointerNoOp',
    'ReducedMotionContract',
    'SaturationBoundary',
  ],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Color Picker Panel',
} satisfies Meta<typeof ColorPickerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const colorPickerPlay: Story['play'] = async ({ args, canvasElement, step }) => {
  args.onChange.mockClear();
  args.onCancel.mockClear();
  args.onCommit.mockClear();
  const canvas = within(canvasElement);
  const surface = canvas.getByRole('slider', {
    name: args.surfaceAccessibilityLabel ?? '채도 및 밝기',
  });
  const hue = canvas.getByRole('slider', { name: args.hueAccessibilityLabel ?? '색상 색조' });
  const input = canvas.getByRole('textbox', { name: args.hexAccessibilityLabel ?? 'HEX 색상' });
  const value = args.value ?? initialValue;
  let expectedControlledValue = { ...value };

  await step('색상 표면과 색조의 접근성 값 확인', async () => {
    await expect(surface).toHaveAttribute('aria-valuemin', '0');
    await expect(surface).toHaveAttribute('aria-valuemax', '100');
    await expect(surface).toHaveAttribute(
      'aria-valuetext',
      `채도 ${value.saturation}, 밝기 ${value.brightness}`,
    );
    await expect(hue).toHaveAttribute('aria-valuemin', '0');
    await expect(hue).toHaveAttribute('aria-valuemax', '360');
    await expect(hue).toHaveAttribute('aria-valuenow', String(value.hue));
    await expect(surface).toHaveAttribute('tabindex', args.disabled ? '-1' : '0');
    await expect(hue).toHaveAttribute('tabindex', args.disabled ? '-1' : '0');
    if (
      value.brightness === initialValue.brightness &&
      value.hue === initialValue.hue &&
      value.saturation === initialValue.saturation
    ) {
      await expect(input).toHaveValue('#4684C2');
    }
  });

  if (args.disabled) {
    return;
  }

  await step('키보드로 채도 값을 변경', async () => {
    await userEvent.tab();
    await expect(surface).toHaveFocus();
    const keyboardValue = {
      ...expectedControlledValue,
      saturation: Math.min(100, expectedControlledValue.saturation + 1),
    };
    await userEvent.keyboard('{ArrowRight}');
    await expect(surface).toHaveAttribute('aria-valuenow', String(keyboardValue.saturation));
    if (keyboardValue.saturation !== expectedControlledValue.saturation) {
      await expect(args.onChange).toHaveBeenLastCalledWith(keyboardValue);
      expectedControlledValue = keyboardValue;
    } else {
      await expect(args.onChange).not.toHaveBeenCalled();
    }
  });

  await step('포인터 drag로 채도와 밝기를 변경', async () => {
    args.onChange.mockClear();
    args.onCommit.mockClear();
    const surfaceRect = surface.getBoundingClientRect();
    await expect(surfaceRect.width).toBeCloseTo(328, 0);
    await expect(surfaceRect.height).toBeCloseTo(180, 0);
    const pointAt = (saturationRatio: number, brightnessRatio: number) => ({
      x: surfaceRect.left + surfaceRect.width * saturationRatio,
      y: surfaceRect.top + surfaceRect.height * (1 - brightnessRatio),
    });
    const pointerStartValue = {
      brightness: 25,
      hue: expectedControlledValue.hue,
      saturation: 25,
    };
    const pointerEndValue = {
      brightness: 75,
      hue: expectedControlledValue.hue,
      saturation: 75,
    };

    await userEvent.pointer({
      coords: pointAt(0.25, 0.25),
      keys: '[MouseLeft>]',
      target: surface,
    });
    await expect(args.onChange).toHaveBeenLastCalledWith(pointerStartValue);
    await expect(args.onCommit).not.toHaveBeenCalled();

    await userEvent.pointer({ coords: pointAt(0.75, 0.75), target: surface });
    fireEvent.pointerUp(surface);
    await expect(args.onChange).toHaveBeenLastCalledWith(pointerEndValue);
    await expect(surface).toHaveAttribute('aria-valuenow', String(pointerEndValue.saturation));
    await expect(surface).toHaveAttribute(
      'aria-valuetext',
      `채도 ${pointerEndValue.saturation}, 밝기 ${pointerEndValue.brightness}`,
    );
    await expect(args.onCommit).not.toHaveBeenCalled();
    expectedControlledValue = pointerEndValue;
  });

  await step('포인터 drag로 색조를 변경', async () => {
    args.onChange.mockClear();
    args.onCommit.mockClear();
    const hueRect = hue.getBoundingClientRect();
    const pointAt = (ratio: number) => ({
      x: hueRect.left + hueRect.width * ratio,
      y: hueRect.top + hueRect.height / 2,
    });
    const pointerStartValue = { ...expectedControlledValue, hue: 90 };
    const pointerEndValue = { ...expectedControlledValue, hue: 270 };

    await userEvent.pointer({
      coords: pointAt(0.25),
      keys: '[MouseLeft>]',
      target: hue,
    });
    await expect(args.onChange).toHaveBeenLastCalledWith(pointerStartValue);
    await userEvent.pointer({ coords: pointAt(0.75), target: hue });
    fireEvent.pointerUp(hue);
    await expect(args.onChange).toHaveBeenLastCalledWith(pointerEndValue);
    await expect(hue).toHaveAttribute('aria-valuenow', String(pointerEndValue.hue));
    await expect(args.onCommit).not.toHaveBeenCalled();
    expectedControlledValue = pointerEndValue;
  });

  await step('HEX 입력을 같은 controlled value와 Actions에 반영', async () => {
    await userEvent.clear(input);
    await userEvent.type(input, '#123456');
    expectedControlledValue = { brightness: 33.73, hue: 210, saturation: 79.07 };
    await expect(args.onChange).toHaveBeenLastCalledWith(expectedControlledValue);
    await expect(input).toHaveValue('#123456');

    await userEvent.click(canvas.getByRole('button', { name: '취소' }));
    await expect(args.onCancel).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: '적용' }));
    await expect(args.onCommit).toHaveBeenLastCalledWith(expectedControlledValue);
  });
};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'title',
        'value',
        'contrastWarning',
        'disabled',
        'surfaceAccessibilityLabel',
        'hueAccessibilityLabel',
        'hexAccessibilityLabel',
      ],
    },
  },
  render: renderControlled,
};

export const InteractionContract: Story = {
  ...Playground,
  parameters: { controls: { disable: true } },
  play: colorPickerPlay,
};

export const SaturationBoundary: Story = {
  args: {
    value: { brightness: 50, hue: 210, saturation: 100 },
  },
  render: renderControlled,
  play: colorPickerPlay,
};

export const MidpointPointerNoOp: Story = {
  args: {
    value: { brightness: 50, hue: 210, saturation: 49 },
  },
  render: renderControlled,
  play: colorPickerPlay,
};

export const ReducedMotionContract: Story = {
  ...Playground,
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByTestId('color-picker-surface');
    const hue = canvas.getByTestId('color-picker-hue');

    expect(getComputedStyle(surface).transitionDuration).toBe('0s');
    expect(getComputedStyle(hue).transitionDuration).toBe('0s');
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => <RepresentativeStatesStory />,
};
