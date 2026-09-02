import baseMeta, {
  InteractionContract as interactionContract,
  MobileCandidateContract as mobileCandidateContract,
  MobileKeyboardContract as mobileKeyboardContract,
  PendingMediaContract as pendingMediaContract,
  StateContract as stateContract,
} from './PostComposer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Composer Target/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const MobileCandidateContract: Story = mobileCandidateContract;
export const MobileKeyboardContract: Story = mobileKeyboardContract;
export const PendingMediaContract: Story = pendingMediaContract;
export const StateContract: Story = stateContract;
