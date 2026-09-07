import baseMeta, {
  AndroidBackInteractionContract as androidBackInteractionContract,
  DisabledInteractionContract as disabledInteractionContract,
  InteractionContract as interactionContract,
  IosBackInteractionContract as iosBackInteractionContract,
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

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
export const IosBackInteractionContract: Story = iosBackInteractionContract;
export const AndroidBackInteractionContract: Story = androidBackInteractionContract;
export const DisabledInteractionContract: Story = disabledInteractionContract;
