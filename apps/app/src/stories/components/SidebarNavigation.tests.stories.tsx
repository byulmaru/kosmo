import baseMeta, {
  CompactInteractionContract as compactInteractionContract,
  DrawerInteractionContract as drawerInteractionContract,
  InteractionContract as interactionContract,
  PresentationTransitionContract as presentationTransitionContract,
  ProfileUnavailableContract as profileUnavailableContract,
  ReducedMotionContract as reducedMotionContract,
} from './SidebarNavigation.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Sidebar Navigation/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
export const CompactInteractionContract: Story = compactInteractionContract;
export const DrawerInteractionContract: Story = drawerInteractionContract;
export const ProfileUnavailableContract: Story = profileUnavailableContract;
export const PresentationTransitionContract: Story = presentationTransitionContract;
