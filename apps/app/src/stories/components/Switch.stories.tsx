import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const defaultLabel = '팔로우 요청 자동 승인';

type SwitchCatalogProps = {
  disabled?: boolean;
  label?: string;
  onValueChange?: (value: boolean) => void;
  value?: boolean;
};

function SwitchCatalog({
  disabled = false,
  label = defaultLabel,
  onValueChange,
  value: initialValue = false,
}: SwitchCatalogProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: space[12],
        maxWidth: 320,
        width: '100%',
      }}
    >
      <Text style={[textStyles.uiCopyL, { color: theme.foregroundPrimary, flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        value={value}
      />
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    label: defaultLabel,
    onValueChange: fn(),
    value: false,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    value: { control: 'boolean' },
  },
  component: SwitchCatalog,
  excludeStories: ['InteractionContract', 'DisabledInteractionContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Switch',
} satisfies Meta<typeof SwitchCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['label', 'disabled', 'value'],
    },
  },
};

export const InteractionContract: Story = {
  args: {
    disabled: false,
    label: defaultLabel,
    value: false,
  },
  play: async ({ args, canvasElement, step }) => {
    args.onValueChange?.mockClear();
    const label = args.label ?? defaultLabel;
    const toggle = within(canvasElement).getByRole('switch', { name: label });

    await step('Switch 상태와 키보드 focus 확인', async () => {
      expect(toggle).not.toBeChecked();
      expect(toggle).not.toBeDisabled();
      await userEvent.tab();
      expect(toggle).toHaveFocus();
    });

    await step('click과 Space로 checked 및 callback 변경 확인', async () => {
      await userEvent.click(toggle);
      expect(toggle).toBeChecked();
      expect(args.onValueChange).toHaveBeenLastCalledWith(true);

      await userEvent.keyboard(' ');
      expect(toggle).not.toBeChecked();
      expect(args.onValueChange).toHaveBeenLastCalledWith(false);
    });
  },
};

export const DisabledInteractionContract: Story = {
  args: {
    disabled: true,
    label: defaultLabel,
    value: false,
  },
  play: async ({ args, canvasElement }) => {
    args.onValueChange?.mockClear();
    const toggle = within(canvasElement).getByRole('switch', { name: args.label ?? defaultLabel });

    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
    toggle.click();
    expect(toggle).not.toBeChecked();
    expect(args.onValueChange).not.toHaveBeenCalled();
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <View style={{ gap: space[16], width: '100%' }}>
      <SwitchCatalog disabled label="비활성 꺼짐" value={false} />
      <SwitchCatalog disabled label="비활성 켜짐" value />
      <SwitchCatalog
        label="팔로우 요청 자동 승인을 위한 아주 긴 Switch 레이블을 표시합니다"
        value
      />
    </View>
  ),
};
