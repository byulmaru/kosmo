import baseMeta, {
  BlockContract as block,
  FailureContract as failure,
  LateCompletionIgnoredAfterProfileChange as lateCompletionIgnored,
  PendingContract as pending,
  UnblockContract as unblock,
} from './ProfileBlockAction.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Block Action/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BlockContract: Story = block;
export const UnblockContract: Story = unblock;
export const FailureContract: Story = failure;
export const PendingContract: Story = pending;
export const LateCompletionIgnoredAfterProfileChange: Story = lateCompletionIgnored;
