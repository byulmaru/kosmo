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
  excludeStories: ['SaturationBoundary', 'MidpointPointerNoOp'],
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

  await step('포인터로 채도와 밝기를 변경', async () => {
    args.onChange.mockClear();
    const surfaceRect = surface.getBoundingClientRect();
    await expect(surfaceRect.width).toBeCloseTo(328, 0);
    await expect(surfaceRect.height).toBeCloseTo(180, 0);
    await fireEvent.click(surface, {
      clientX: surfaceRect.left + surfaceRect.width / 2,
      clientY: surfaceRect.top + surfaceRect.height / 2,
    });
    const pointerValue = {
      brightness: 50,
      hue: expectedControlledValue.hue,
      saturation: 50,
    };
    const pointerChanged =
      pointerValue.brightness !== expectedControlledValue.brightness ||
      pointerValue.hue !== expectedControlledValue.hue ||
      pointerValue.saturation !== expectedControlledValue.saturation;
    if (pointerChanged) {
      await expect(args.onChange).toHaveBeenLastCalledWith(pointerValue);
      expectedControlledValue = pointerValue;
      await expect(input).toHaveValue('#406080');
    } else {
      await expect(args.onChange).not.toHaveBeenCalled();
    }
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

export const Default: Story = {};

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

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => <RepresentativeStatesStory />,
};
