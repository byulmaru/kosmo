import { View } from 'react-native';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ColorWell } from '@/components/ui/ColorWell';
import { colors } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'KOSMO/Components/Color Well',
  component: ColorWell,
  args: { accessibilityLabel: '강조 색상', color: '', disabled: false, onPress: fn() },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    color: { control: 'color' },
    disabled: { control: 'boolean' },
    onPress: { control: false },
  },
  excludeStories: ['InteractionContract'],
} satisfies Meta<typeof ColorWell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      <ColorWell {...args} color="#347AC2" />
      <ColorWell {...args} color="#347AC2" disabled />
      <ColorWell
        {...args}
        color="#FFFFFF"
        accessibilityLabel="아주 긴 이름을 가진 프로필의 배경 색상"
      />
    </View>
  ),
};

export const InteractionContract: Story = {
  args: { color: '#347AC2' },
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      <ColorWell {...args} />
      <ColorWell {...args} accessibilityLabel="비활성 색상" disabled />
    </View>
  ),
  play: async ({ args, canvasElement, globals }) => {
    args.onPress.mockClear();
    const user = userEvent.setup();
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '강조 색상: #347AC2' });
    const disabled = canvas.getByRole('button', { name: '비활성 색상: #347AC2' });
    expect(button.getBoundingClientRect().width).toBe(48);
    expect(button.getBoundingClientRect().height).toBe(48);
    const surface = button.firstElementChild as HTMLElement;
    const swatch = surface.firstElementChild as HTMLElement;
    expect(surface.getBoundingClientRect().width).toBe(40);
    expect(swatch.getBoundingClientRect().width).toBe(32);
    expect(swatch).toHaveStyle({ backgroundColor: '#347AC2' });
    const theme = colors[globals.theme === 'dark' ? 'dark' : 'light'];
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).not.toHaveAttribute('aria-selected');
    await user.tab();
    expect(button).toHaveFocus();
    expect(surface).toHaveStyle({ borderColor: theme.stateFocusRing });
    await user.keyboard('{Enter}');
    expect(args.onPress).toHaveBeenCalledOnce();
    expect(surface).toHaveStyle({ borderColor: theme.stateFocusRing });
    await user.unhover(button);
    await user.hover(button);
    await user.pointer({ target: button, keys: '[MouseLeft>]' });
    await waitFor(() => expect(surface).toHaveStyle({ backgroundColor: theme.statePressed }));
    await user.pointer({ target: button, keys: '[/MouseLeft]' });
    await waitFor(() => expect(surface).toHaveStyle({ backgroundColor: theme.stateHover }));
    await user.click(button);
    expect(args.onPress).toHaveBeenCalledTimes(3);
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled.firstElementChild?.firstElementChild).toHaveStyle({
      backgroundColor: '#347AC2',
    });
    await fireEvent.click(disabled);
    expect(args.onPress).toHaveBeenCalledTimes(3);
  },
};
