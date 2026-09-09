import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SegmentedControlOptions } from '@/components/ui/SegmentedControl';

type SegmentValue = string;
const defaultLabels = ['옵션 1', '옵션 2', '옵션 3', '옵션 4'];

function makeOptions(labels: string[], optionCount: number): SegmentedControlOptions<SegmentValue> {
  const count = Math.max(2, Math.min(4, optionCount));
  return Array.from({ length: count }, (_, index) => ({
    label: labels[index]?.trim() || defaultLabels[index],
    value: `option-${index + 1}`,
  })) as unknown as SegmentedControlOptions<SegmentValue>;
}

type SegmentedControlCatalogProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  initialItem?: number;
  onValueChange?: (value: SegmentValue) => void;
  optionCount?: number;
  optionLabels?: string[];
};

function SegmentedControlCatalog({
  accessibilityLabel = '표시 방식',
  disabled = false,
  initialItem = 1,
  onValueChange,
  optionCount = 3,
  optionLabels = defaultLabels,
}: SegmentedControlCatalogProps) {
  const options = makeOptions(optionLabels, optionCount);
  const initialValue = options[Math.max(0, Math.min(initialItem - 1, options.length - 1))].value;
  const [value, setValue] = useState(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <View style={{ maxWidth: 320, width: '100%' }}>
      <SegmentedControl
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onValueChange={(next) => {
          setValue(next);
          onValueChange?.(next);
        }}
        options={options}
        value={value}
      />
    </View>
  );
}

const meta = {
  args: {
    accessibilityLabel: '표시 방식',
    disabled: false,
    initialItem: 1,
    onValueChange: fn(),
    optionCount: 3,
    optionLabels: defaultLabels,
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    disabled: { control: 'boolean' },
    initialItem: { control: { max: 4, min: 1, step: 1, type: 'number' } },
    optionCount: { control: { max: 4, min: 2, step: 1, type: 'range' } },
    optionLabels: { control: 'object' },
  },
  component: SegmentedControlCatalog,
  excludeStories: ['InteractionContract', 'DisabledInteractionContract'],
  parameters: { controls: { disable: true } },
  render: (args) => (
    <SegmentedControlCatalog
      key={JSON.stringify([args.initialItem, args.optionCount, args.optionLabels])}
      {...args}
    />
  ),
  title: 'KOSMO/Components/Segmented Control',
} satisfies Meta<typeof SegmentedControlCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['accessibilityLabel', 'disabled', 'initialItem', 'optionCount', 'optionLabels'],
    },
  },
};

export const InteractionContract: Story = {
  args: { disabled: false, initialItem: 1, optionCount: 3, optionLabels: defaultLabels },
  play: async ({ args, canvasElement, step }) => {
    args.onValueChange?.mockClear();
    const group = within(canvasElement).getByRole('radiogroup', { name: '표시 방식' });
    const radios = within(group).getAllByRole('radio');

    await step('정확히 하나의 선택과 tab stop 확인', async () => {
      expect(radios).toHaveLength(3);
      expect(radios.filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(
        1,
      );
      expect(radios[0]).toBeChecked();
      await userEvent.tab();
      expect(radios[0]).toHaveFocus();
    });

    await step('방향키로 focus와 선택을 함께 이동', async () => {
      await userEvent.keyboard('{ArrowRight}');
      expect(radios[1]).toHaveFocus();
      expect(radios[1]).toBeChecked();
      expect(args.onValueChange).toHaveBeenLastCalledWith('option-2');
    });

    await step('포인터로 선택 변경', async () => {
      await userEvent.click(radios[2]);
      expect(radios[2]).toBeChecked();
      expect(args.onValueChange).toHaveBeenLastCalledWith('option-3');
    });
  },
};

export const DisabledInteractionContract: Story = {
  args: { disabled: true, initialItem: 2, optionCount: 3, optionLabels: defaultLabels },
  play: async ({ args, canvasElement }) => {
    args.onValueChange?.mockClear();
    const radios = within(
      within(canvasElement).getByRole('radiogroup', { name: '표시 방식' }),
    ).getAllByRole('radio');

    expect(radios[1]).toBeChecked();
    for (const radio of radios) {
      expect(radio).toHaveAttribute('aria-disabled', 'true');
      expect(radio).toHaveAttribute('tabindex', '-1');
    }
    radios[0].click();
    expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

export const RepresentativeStates: Story = {
  render: () => {
    const longOptions = [
      { label: '시스템 설정에 맞추기', value: 'system' },
      { label: '라이트', value: 'light' },
      { label: '다크', value: 'dark' },
    ] satisfies SegmentedControlOptions<string>;
    const counts = [2, 3, 4] as const;

    return (
      <View style={{ gap: space[16], maxWidth: 320, width: '100%' }}>
        {counts.map((count) => {
          const options = makeOptions(defaultLabels, count);
          return (
            <SegmentedControl
              accessibilityLabel={`${count}개 옵션`}
              key={count}
              onValueChange={() => undefined}
              options={options}
              value={options.at(-1)!.value}
            />
          );
        })}
        <SegmentedControl
          accessibilityLabel="긴 레이블"
          onValueChange={() => undefined}
          options={longOptions}
          value="system"
        />
        <SegmentedControl
          accessibilityLabel="비활성 표시 방식"
          disabled
          onValueChange={() => undefined}
          options={longOptions}
          value="dark"
        />
      </View>
    );
  },
};
