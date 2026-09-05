import baseMeta, {
  ApproveFailureAndRetry as approveFailureAndRetry,
  ApprovePending as approvePending,
  LayoutContract as layoutContract,
  RejectFailureAndRetry as rejectFailureAndRetry,
  RejectPending as rejectPending,
} from './FollowRequestListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/FollowRequestListItem/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutContract: Story = layoutContract;
export const ApprovePending: Story = approvePending;
export const RejectPending: Story = rejectPending;
export const ApproveFailureAndRetry: Story = approveFailureAndRetry;
export const RejectFailureAndRetry: Story = rejectFailureAndRetry;
