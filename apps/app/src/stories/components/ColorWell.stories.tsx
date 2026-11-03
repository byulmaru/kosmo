import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ColorPickerPanel, hexToHsb, hsbToHex } from '@/components/ui/ColorPickerPanel';
import { ColorWell } from '@/components/ui/ColorWell';
import { colors } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ColorWellProps } from '@/components/ui/ColorWell';

const fallbackValue = { brightness: 76, hue: 210, saturation: 64 };

type ColorWellStoryArgs = ColorWellProps & { pickerTitle: string };
type ColorWellCatalogProps = ColorWellStoryArgs & {
  updateArgs?: (update: Partial<Pick<ColorWellStoryArgs, 'color'>>) => void;
};

function ColorWellCatalog({
  color = '#4684C2',
  pickerTitle,
  updateArgs,
  ...args
}: ColorWellCatalogProps) {
  const initialValue = hexToHsb(color) ?? fallbackValue;
  const [committedValue, setCommittedValue] = useState(initialValue);
  const [draftValue, setDraftValue] = useState(initialValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const nextValue = hexToHsb(color) ?? fallbackValue;
    setCommittedValue(nextValue);
    setDraftValue(nextValue);
  }, [color]);

  return (
    <View style={{ gap: 12, width: 360 }}>
      <ColorWell
        {...args}
        color={hsbToHex(committedValue)}
        onPress={() => {
          setDraftValue(committedValue);
          setOpen((current) => !current);
          args.onPress();
        }}
      />
      {open ? (
        <ColorPickerPanel
          onCancel={() => {
            setDraftValue(committedValue);
            setOpen(false);
          }}
          onChange={setDraftValue}
          onCommit={(value) => {
            setCommittedValue(value);
            setOpen(false);
            updateArgs?.({ color: hsbToHex(value) });
          }}
          title={pickerTitle}
          value={draftValue}
        />
      ) : null}
    </View>
  );
}

const meta = {
  title: 'KOSMO/Components/Color Well',
  component: ColorWellCatalog,
  args: {
    accessibilityLabel: '강조 색상',
    color: '#4684C2',
    disabled: false,
    onPress: fn(),
    pickerTitle: '강조 색상 선택',
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    color: { control: 'color' },
    disabled: { control: 'boolean' },
    onPress: { control: false },
    pickerTitle: { control: 'text' },
  },
  excludeStories: ['InteractionContract'],
} satisfies Meta<typeof ColorWellCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['accessibilityLabel', 'color', 'disabled', 'pickerTitle'],
    },
  },
  render: (args) => {
    const [, updateArgs] = useArgs<ColorWellStoryArgs>();
    return <ColorWellCatalog {...args} updateArgs={updateArgs} />;
  },
};

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
    const feedback = surface.firstElementChild as HTMLElement;
    const swatch = surface.lastElementChild as HTMLElement;
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
    await waitFor(() => expect(feedback).toHaveStyle({ backgroundColor: theme.statePressed }));
    await user.pointer({ target: button, keys: '[/MouseLeft]' });
    await waitFor(() => expect(feedback).toHaveStyle({ backgroundColor: theme.stateHover }));
    await user.click(button);
    expect(args.onPress).toHaveBeenCalledTimes(3);
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled.firstElementChild?.lastElementChild).toHaveStyle({
      backgroundColor: '#347AC2',
    });
    await fireEvent.click(disabled);
    expect(args.onPress).toHaveBeenCalledTimes(3);
  },
};
