import { useState } from 'react';
import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RadioOption as RadioOptionConfig } from '@/components/ui/RadioGroup';

type RadioValue = 'email' | 'push' | 'sms' | 'inApp';

const longLabel = '휴대전화 문자로 받는 아주 긴 알림 이름';
const longDescription = '중요한 소식과 보안 안내를 문자로 알려드려요.';
const options = [
  { label: '이메일', value: 'email' },
  { disabled: true, label: '푸시 알림', value: 'push' },
  { description: longDescription, label: longLabel, value: 'sms' },
  { label: '앱 알림', value: 'inApp' },
] satisfies readonly RadioOptionConfig<RadioValue>[];

function RadioGroupCatalog({ initialValue = 'email' }: { initialValue?: RadioValue }) {
  const [value, setValue] = useState<RadioValue>(initialValue);

  return (
    <View>
      <RadioGroup accessibilityLabel="알림 방식" onChange={setValue} value={value}>
        {options.map((option) => (
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
  component: RadioGroupCatalog,
  title: 'KOSMO/Components/Radio Group',
} satisfies Meta<typeof RadioGroupCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: '알림 방식' });
    const email = within(group).getByRole('radio', { name: '이메일' });
    const push = within(group).getByRole('radio', { name: '푸시 알림' });
    const sms = within(group).getByRole('radio', {
      name: `${longLabel}: ${longDescription}`,
    });
    const inApp = within(group).getByRole('radio', { name: '앱 알림' });

    expect(canvas.getAllByRole('radio')).toHaveLength(4);
    expect(group).toBeVisible();
    expect(email).toBeChecked();
    expect(push).not.toBeChecked();
    expect(push).toHaveAttribute('aria-disabled', 'true');
    expect(sms).not.toBeChecked();
    expect(inApp).not.toBeChecked();
    expect(email).toHaveAttribute('tabindex', '0');
    expect(push).toHaveAttribute('tabindex', '-1');
    expect(sms).toHaveAttribute('tabindex', '-1');
    expect(inApp).toHaveAttribute('tabindex', '-1');

    await userEvent.tab();
    expect(email).toHaveFocus();
    expect(getComputedStyle(email).borderWidth).toBe('2px');

    await userEvent.click(email);
    expect(email).toHaveFocus();
    expect(getComputedStyle(email).borderWidth).toBe('0px');

    await userEvent.keyboard('{ArrowRight}');
    expect(sms).toHaveFocus();
    expect(sms).toBeChecked();
    expect(getComputedStyle(sms).borderWidth).toBe('2px');

    await userEvent.keyboard('{ArrowRight}');
    expect(inApp).toHaveFocus();
    expect(inApp).toBeChecked();

    await userEvent.keyboard('{ArrowRight}');
    expect(email).toHaveFocus();
    expect(email).toBeChecked();

    await userEvent.click(sms);
    expect(sms).toBeChecked();
    expect(email).not.toBeChecked();
  },
};

export const FallbackTabStop: Story = {
  args: { initialValue: 'push' },
};

export const VisualStates: Story = {
  render: () => <RadioGroupVisualStates />,
};

export const VisualStatesDark: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
  render: () => <RadioGroupVisualStates />,
};
