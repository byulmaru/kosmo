import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  BackInteractionContract as backInteractionContract,
  ClearHoldInteractionContract as clearHoldInteractionContract,
  DisabledInteractionContract as disabledInteractionContract,
  FocusVisibleInteractionContract as focusVisibleInteractionContract,
  InteractionContract as interactionContract,
  ReducedMotionContract as reducedMotionContract,
  WithHelpAction as withHelpAction,
} from './SearchToolbar.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Search Toolbar/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BackInteractionContract: Story = backInteractionContract;
export const ClearHoldInteractionContract: Story = clearHoldInteractionContract;
export const InteractionContract: Story = interactionContract;
export const FocusVisibleInteractionContract: Story = focusVisibleInteractionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
export const DisabledInteractionContract: Story = disabledInteractionContract;

export const HelpActionContract: Story = {
  ...withHelpAction,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText('검색어를 입력하세요');
    await userEvent.click(input);
    await userEvent.type(input, ' 검색');
    await userEvent.click(canvas.getByRole('button', { name: '검색 도움말' }));
    expect(input).toHaveValue('코스모 검색');
    expect(args.onSubmit).not.toHaveBeenCalled();
    expect(args.onClear).not.toHaveBeenCalled();
  },
};
