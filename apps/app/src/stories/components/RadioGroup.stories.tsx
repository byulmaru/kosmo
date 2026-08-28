import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RadioOption as RadioOptionConfig } from '@/components/ui/RadioGroup';

type RadioValue = string;

const longLabel = '휴대전화 문자로 받는 아주 긴 알림 이름';
const longDescription = '중요한 소식과 보안 안내를 문자로 알려드려요.';
const defaultOptions = [
  { label: '이메일', value: 'email' },
  { disabled: true, label: '푸시 알림', value: 'push' },
  { description: longDescription, label: longLabel, value: 'sms' },
  { label: '앱 알림', value: 'inApp' },
] satisfies readonly RadioOptionConfig<RadioValue>[];

const defaultOptionLabels = defaultOptions.map((option) => option.label);

function RadioGroupCatalog({
  accessibilityLabel = '알림 방식',
  disabled = false,
  initialItem = 1,
  onChange,
  optionCount = 4,
  optionLabels = defaultOptionLabels,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  initialItem?: number;
  onChange?: (value: RadioValue) => void;
  optionCount?: number;
  optionLabels?: string[];
}) {
  const visibleOptions = Array.from(
    { length: Math.max(1, Math.min(8, optionCount)) },
    (_, index): RadioOptionConfig<RadioValue> => ({
      ...defaultOptions[index],
      label: optionLabels[index]?.trim() || defaultOptions[index]?.label || `항목 ${index + 1}`,
      value: defaultOptions[index]?.value ?? `option-${index + 1}`,
    }),
  );
  const initialValue =
    visibleOptions[Math.max(0, Math.min(initialItem - 1, optionCount - 1))].value;
  const [value, setValue] = useState<RadioValue>(initialValue);
  const handleChange = (nextValue: RadioValue) => {
    setValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <View>
      <RadioGroup
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onChange={handleChange}
        value={value}
      >
        {visibleOptions.map((option) => (
          <RadioOption key={option.value} option={option} />
        ))}
      </RadioGroup>
    </View>
  );
}

const visualOptions = [
  { label: '기본', value: 'default' },
  { description: '선택 상태 설명', label: '선택됨', value: 'selected' },
  { disabled: true, label: '비활성', value: 'disabled' },
] as const;

function RadioGroupVisualStates() {
  return (
    <View style={{ gap: 12 }}>
      <RadioGroup accessibilityLabel="라디오 시각 상태" onChange={() => undefined} value="selected">
        {visualOptions.map((option) => (
          <RadioOption key={option.value} option={option} />
        ))}
      </RadioGroup>
      <RadioGroup
        accessibilityLabel="비활성 라디오 시각 상태"
        disabled
        onChange={() => undefined}
        value="selected"
      >
        {visualOptions.map((option) => (
          <RadioOption key={option.value} option={option} />
        ))}
      </RadioGroup>
    </View>
  );
}

const meta = {
  args: {
    accessibilityLabel: '알림 방식',
    disabled: false,
    initialItem: 1,
    onChange: fn(),
    optionCount: 4,
    optionLabels: defaultOptionLabels,
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    initialItem: { control: { max: 8, min: 1, step: 1, type: 'number' } },
    optionCount: { control: { max: 8, min: 1, step: 1, type: 'range' } },
    optionLabels: { control: 'object' },
  },
  component: RadioGroupCatalog,
  excludeStories: ['FallbackTabStop'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Radio Group',
} satisfies Meta<typeof RadioGroupCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['accessibilityLabel', 'disabled', 'initialItem', 'optionCount', 'optionLabels'],
    },
  },
  render: (args) => (
    <RadioGroupCatalog
      key={JSON.stringify([args.initialItem, args.optionCount, args.optionLabels])}
      {...args}
    />
  ),
  play: async ({ args, canvasElement, step }) => {
    args.onChange?.mockClear();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', {
      name: args.accessibilityLabel ?? '알림 방식',
    });
    const radios = within(group).getAllByRole('radio');
    const optionCount = Math.max(1, Math.min(8, args.optionCount ?? 4));
    const initialIndex = Math.max(0, Math.min((args.initialItem ?? 1) - 1, optionCount - 1));
    const selectedRadio = radios[initialIndex];
    const enabledRadios = radios.filter((radio) => radio.getAttribute('aria-disabled') !== 'true');
    const tabStop =
      selectedRadio.getAttribute('aria-disabled') === 'true' ? enabledRadios[0] : selectedRadio;

    await step('초기 선택과 접근성 상태 확인', async () => {
      expect(radios).toHaveLength(optionCount);
      expect(group).toBeVisible();
      expect(selectedRadio).toBeChecked();
      if (args.disabled) {
        for (const radio of radios) {
          expect(radio).toHaveAttribute('aria-disabled', 'true');
          expect(radio).toHaveAttribute('tabindex', '-1');
        }
        return;
      }
      expect(tabStop).toHaveAttribute('tabindex', '0');
      for (const radio of radios.filter((radio) => radio !== tabStop)) {
        expect(radio).toHaveAttribute('tabindex', '-1');
      }
      await userEvent.tab();
      expect(tabStop).toHaveFocus();
      expect(getComputedStyle(tabStop).borderWidth).toBe('2px');
    });

    if (args.disabled || enabledRadios.length < 2) {
      return;
    }

    await step('키보드로 라디오 선택 변경', async () => {
      await userEvent.keyboard('{ArrowRight}');
      const nextRadio = enabledRadios[(enabledRadios.indexOf(tabStop) + 1) % enabledRadios.length];
      expect(nextRadio).toHaveFocus();
      expect(nextRadio).toBeChecked();
      expect(args.onChange).toHaveBeenCalledOnce();
    });

    await step('포인터 선택과 선택 상태 확인', async () => {
      const target = enabledRadios.find((radio) => radio.getAttribute('aria-checked') !== 'true')!;
      await userEvent.click(target);
      expect(target).toBeChecked();
      expect(args.onChange).toHaveBeenCalledTimes(2);
    });
  },
};

export const FallbackTabStop: Story = {
  args: { initialItem: 2 },
};

export const VisualStates: Story = {
  render: () => <RadioGroupVisualStates />,
};
