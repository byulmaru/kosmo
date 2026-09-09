import { expect, userEvent, waitFor, within } from 'storybook/test';
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
    const publicOption = canvas.getByRole('option', { name: '전체 공개' });
    const followerOption = canvas.getByRole('option', { name: '팔로워에게만 공개' });
    expect(followerOption).toHaveStyle({ borderRadius: '8px' });
    await waitFor(() => expect(publicOption).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(followerOption).toHaveFocus());
    await userEvent.keyboard('{Enter}');

    const selectedTrigger = canvas.getByRole('button', { name: '공개 범위: 팔로워에게만 공개' });
    expect(selectedTrigger).toHaveFocus();
    expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    expect(args.onPress).toHaveBeenCalledOnce();

    await userEvent.click(selectedTrigger);
    await waitFor(() =>
      expect(canvas.getByRole('option', { name: '팔로워에게만 공개' })).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    expect(selectedTrigger).toHaveFocus();
    expect(canvas.queryByRole('listbox')).not.toBeInTheDocument();
    expect(args.onPress).toHaveBeenCalledTimes(2);
  },
};
