import baseMeta, {
  InteractionContract as interactionContract,
  ProfileUnavailableContract as profileUnavailableContract,
  ReducedMotionContract as reducedMotionContract,
} from './BottomTabBar.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Bottom Tab Bar/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
export const ProfileUnavailableContract: Story = profileUnavailableContract;
