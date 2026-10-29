import baseMeta, {
  CancelSelectionContract as cancelSelectionContract,
  FailureAndCancelContract as failureAndCancelContract,
  InteractionContract as interactionContract,
  PendingSelectionContract as pendingSelectionContract,
} from './PostComposerProfileSwitcher.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerProfileFixture } from './PostComposerProfileSwitcher.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Post Composer Profile Switcher/Tests',
} satisfies Meta<typeof ComposerProfileFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const PendingSelectionContract: Story = pendingSelectionContract;
export const FailureAndCancelContract: Story = failureAndCancelContract;
export const CancelSelectionContract: Story = cancelSelectionContract;
