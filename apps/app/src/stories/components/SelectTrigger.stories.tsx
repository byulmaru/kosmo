import { useId } from 'react';
import { View } from 'react-native';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ListboxOption } from '@/components/ui/ListboxOption';
import { SelectTrigger } from '@/components/ui/SelectTrigger';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, colors, radius, space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

type CatalogProps = {
  accessibilityLabel: string;
  disabled: boolean;
  error: string;
  onPress: () => void;
  open: boolean;
  placeholder: string;
  value: string;
};

function SelectTriggerCatalog({ open, disabled, ...args }: CatalogProps) {
  const elevation = useElevation();
  const theme = useTheme();
  const controls = useId();
  const expanded = open && !disabled;

  return (
    <View style={{ gap: 8, width: '100%', maxWidth: 320, padding: 4 }}>
      <SelectTrigger
        {...args}
        onPress={args.onPress}
        {...(expanded ? { open: true, controls } : { open: false, disabled })}
      />
      {expanded ? (
        <View
          nativeID={controls}
          {...({ role: 'listbox' } as unknown as { role?: never })}
          accessibilityLabel={args.accessibilityLabel}
          style={[
            elevation.floating,
            {
              backgroundColor: theme.backgroundElevated,
              borderColor: theme.borderDefault,
              borderRadius: radius[12],
              borderWidth: borderWidths[1],
              gap: space[4],
              padding: space[4],
            },
          ]}
        >
          <ListboxOption
            label={args.value || args.placeholder}
            selected={Boolean(args.value)}
            style={{ borderRadius: radius[8] }}
            onSelect={args.onPress}
          />
        </View>
      ) : null}
    </View>
  );
}

const meta = {
  title: 'KOSMO/Components/Select Trigger',
  component: SelectTriggerCatalog,
  args: {
    accessibilityLabel: '공개 범위',
    disabled: false,
    error: '',
    onPress: fn(),
    open: false,
    placeholder: '선택하세요',
    value: '',
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    open: { control: 'boolean' },
    placeholder: { control: 'text' },
    value: { control: 'text' },
    onPress: { control: false },
  },
  render: (args) => <SelectTriggerCatalog {...args} />,
  excludeStories: ['InteractionContract', 'OpenContract'],
} satisfies Meta<CatalogProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View style={{ gap: 16, width: '100%', maxWidth: 320 }}>
      <SelectTriggerCatalog {...args} value="팔로워에게만 공개" />
      <SelectTriggerCatalog {...args} error="공개 범위를 선택하세요." />
      <SelectTriggerCatalog {...args} disabled value="비공개" />
      <SelectTriggerCatalog
        {...args}
        value="선택한 프로필을 팔로우하고 있는 모든 사용자에게만 공개하는 아주 긴 선택값"
        accessibilityLabel="이름이 아주 긴 프로필의 기본 게시물 공개 범위"
      />
    </View>
  ),
};

export const InteractionContract: Story = {
  args: {
    error: '공개 범위를 선택하세요.',
    value: '선택한 프로필을 팔로우하고 있는 모든 사용자에게만 공개하는 아주 긴 선택값',
  },
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      <SelectTriggerCatalog {...args} />
      <SelectTriggerCatalog {...args} accessibilityLabel="비활성 공개 범위" disabled />
    </View>
  ),
  play: async ({ args, canvasElement, globals }) => {
    args.onPress.mockClear();
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', {
      name: `${args.accessibilityLabel}: ${args.value}`,
    });
    expect(button).toHaveAttribute('aria-haspopup', 'listbox');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(button).toHaveAttribute('aria-invalid', 'true');
    expect(button).toHaveAccessibleDescription(args.error);
    expect(button.getBoundingClientRect().height).toBe(48);
    await user.hover(button);
    expect(button.firstElementChild?.firstElementChild).toHaveStyle({
      backgroundColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].stateHover,
    });
    await user.unhover(button);
    await user.tab();
    expect(button).toHaveFocus();
    expect(button.firstElementChild).toHaveStyle({
      borderColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].feedbackDangerBorder,
    });
    await user.keyboard('{Enter}');
    expect(args.onPress).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(args.onPress).toHaveBeenCalledTimes(2);
    const disabled = canvas.getByRole('button', { name: `비활성 공개 범위: ${args.value}` });
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(disabled);
    expect(args.onPress).toHaveBeenCalledTimes(2);
  },
};

export const OpenContract: Story = {
  args: { open: true, value: '팔로워에게만 공개' },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, globals }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', {
      name: `${args.accessibilityLabel}: ${args.value}`,
    });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(canvas.getByRole('listbox')).toHaveAttribute('id', button.getAttribute('aria-controls'));
    expect(canvas.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    await userEvent.tab();
    expect(button).toHaveFocus();
    expect(button.firstElementChild).toHaveStyle({
      borderColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].stateFocusRing,
    });
  },
};
