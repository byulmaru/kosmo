import baseMeta, {
  FailureAndCancelContract as failureAndCancelContract,
  InteractionContract as interactionContract,
  PendingSelectionContract as pendingSelectionContract,
} from './PostComposerProfileSwitcher.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Composer Profile Switcher/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const PendingSelectionContract: Story = pendingSelectionContract;
export const FailureAndCancelContract: Story = failureAndCancelContract;
