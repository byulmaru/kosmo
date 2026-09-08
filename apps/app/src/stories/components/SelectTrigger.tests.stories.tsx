import { expect, userEvent, within } from 'storybook/test';
import { colors, elevations } from '@/theme/tokens';
import baseMeta, {
  InteractionContract as interactionContract,
  OpenContract as openContract,
  Playground as playground,
} from './SelectTrigger.stories';
import type { StoryObj } from '@storybook/react-vite';

type Story = StoryObj<typeof baseMeta>;

export default {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Select Trigger/Tests',
};

export const InteractionContract = interactionContract;
export const DarkInteractionContract = { ...interactionContract, globals: { theme: 'dark' } };
export const OpenContract = openContract;
export const PlaygroundInteractionContract: Story = {
  ...playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, globals }) => {
    args.onPress.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '공개 범위: 선택하세요' });

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(canvas.getByRole('listbox')).toHaveStyle({
      ...elevations[globals.theme === 'dark' ? 'dark' : 'light'].floating,
      backgroundColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].backgroundElevated,
      borderColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].borderDefault,
      borderRadius: '12px',
      borderWidth: '1px',
      gap: '4px',
      padding: '4px',
    });
    const dividers = canvas.getAllByTestId('select-trigger-option-divider');
    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) =>
      expect(divider).toHaveStyle({
        borderTopColor: colors[globals.theme === 'dark' ? 'dark' : 'light'].borderSubtle,
        borderTopWidth: '1px',
      }),
    );
    await userEvent.click(canvas.getByRole('option', { name: '팔로워에게만 공개' }));

    expect(canvas.getByRole('button', { name: '공개 범위: 팔로워에게만 공개' })).toHaveFocus();
    expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    expect(args.onPress).toHaveBeenCalledOnce();
  },
};
