import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Checkbox } from '@/components/ui/Checkbox';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CheckboxValue } from '@/components/ui/Checkbox';

const defaultLabel = '모두 선택';

type CheckboxCatalogProps = {
  checked?: CheckboxValue;
  disabled?: boolean;
  label?: string;
  onCheckedChange?: (checked: boolean) => void;
};

function CheckboxCatalog({
  checked: initialChecked = false,
  disabled = false,
  label = defaultLabel,
  onCheckedChange,
}: CheckboxCatalogProps) {
  const theme = useTheme();
  const [checked, setChecked] = useState<CheckboxValue>(initialChecked);

  useEffect(() => setChecked(initialChecked), [initialChecked]);

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: space[8] }}>
      <Checkbox
        accessibilityLabel={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          setChecked(next);
          onCheckedChange?.(next);
        }}
      />
      <Text style={[textStyles.uiCopyM, { color: theme.foregroundPrimary, flexShrink: 1 }]}>
        {label}
      </Text>
    </View>
  );
}

const meta = {
  args: {
    checked: false,
    disabled: false,
    label: defaultLabel,
    onCheckedChange: fn(),
  },
  argTypes: {
    checked: { control: 'select', options: [false, true, 'mixed'] },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
  },
  component: CheckboxCatalog,
  excludeStories: ['InteractionContract', 'DisabledInteractionContract'],
  parameters: { controls: { disable: true } },
  render: (args) => <CheckboxCatalog key={String(args.checked)} {...args} />,
  title: 'KOSMO/Components/Checkbox',
} satisfies Meta<typeof CheckboxCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['checked', 'disabled', 'label'] },
  },
};

export const InteractionContract: Story = {
  args: { checked: 'mixed', disabled: false, label: defaultLabel },
  play: async ({ args, canvasElement, step }) => {
    args.onCheckedChange?.mockClear();
    const checkbox = within(canvasElement).getByRole('checkbox', { name: defaultLabel });

    await step('mixed 상태와 keyboard focus 확인', async () => {
      expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
      await userEvent.tab();
      expect(checkbox).toHaveFocus();
    });

    await step('Space로 checked 상태와 callback 변경', async () => {
      await userEvent.keyboard(' ');
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
      expect(args.onCheckedChange).toHaveBeenLastCalledWith(true);
    });
  },
};

export const DisabledInteractionContract: Story = {
  args: { checked: true, disabled: true, label: defaultLabel },
  play: async ({ args, canvasElement }) => {
    args.onCheckedChange?.mockClear();
    const checkbox = within(canvasElement).getByRole('checkbox', { name: defaultLabel });

    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    checkbox.click();
    expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <View style={{ gap: space[12] }}>
      <CheckboxCatalog checked={false} label="선택 안 됨" />
      <CheckboxCatalog checked label="선택됨" />
      <CheckboxCatalog checked="mixed" label="일부 선택됨" />
      <CheckboxCatalog checked disabled label="비활성 선택됨" />
      <CheckboxCatalog
        checked="mixed"
        label="그룹에 포함된 항목 중 일부만 선택되었음을 알리는 아주 긴 레이블"
      />
    </View>
  ),
};
