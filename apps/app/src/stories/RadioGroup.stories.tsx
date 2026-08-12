import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { SelectMenu } from '@/components/ui/SelectMenu';
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

type SelectValue = 'all' | 'mentions';

const selectOptions = [
  { label: '모든 알림', value: 'all' },
  { description: '나를 언급한 알림만 보여줘요.', label: '멘션만', value: 'mentions' },
] satisfies readonly RadioOptionConfig<SelectValue>[];

function RadioGroupCatalog({ initialValue = 'email' }: { initialValue?: RadioValue }) {
  const [value, setValue] = useState<RadioValue>(initialValue);

  return (
    <View>
      <RadioGroup
        accessibilityLabel="알림 방식"
        onChange={setValue}
        options={options}
        value={value}
      >
        {options.map((option) => (
          <RadioOption key={option.value} option={option}>
            <View>
              <Text>{option.label}</Text>
              {option.description ? <Text>{option.description}</Text> : null}
            </View>
          </RadioOption>
        ))}
      </RadioGroup>
    </View>
  );
}

function SelectMenuCatalog() {
  const [value, setValue] = useState<SelectValue>('all');

  return <SelectMenu label="알림 범위" onChange={setValue} options={selectOptions} value={value} />;
}

const meta = {
  component: RadioGroupCatalog,
  title: 'KOSMO/UI/Radio Group',
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

    await userEvent.keyboard('{ArrowRight}');
    expect(sms).toHaveFocus();
    expect(sms).toBeChecked();

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

export const SelectMenuInteractionContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '모든 알림' });

    await userEvent.click(trigger);
    const group = await page.findByRole('radiogroup', { name: '알림 범위' });
    const mentions = within(group).getByRole('radio', { name: /멘션만/ });

    expect(group).toBeVisible();
    expect(mentions).toBeVisible();
    await userEvent.click(mentions);
    expect(canvas.getByRole('button', { name: '멘션만' })).toBeVisible();
    await waitFor(() =>
      expect(page.queryAllByRole('dialog', { name: '알림 범위' })).toHaveLength(0),
    );
  },
  render: () => <SelectMenuCatalog />,
};
