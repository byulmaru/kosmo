import baseMeta, {
  BackInteractionContract as backInteractionContract,
  ClearHoldInteractionContract as clearHoldInteractionContract,
  DisabledInteractionContract as disabledInteractionContract,
  FocusVisibleInteractionContract as focusVisibleInteractionContract,
  InteractionContract as interactionContract,
  ReducedMotionContract as reducedMotionContract,
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
