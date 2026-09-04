import baseMeta, {
  CancelError as cancelError,
  CancelPending as cancelPending,
  CancelSuccess as cancelSuccess,
  FollowError as followError,
  FollowPending as followPending,
  FollowSuccess as followSuccess,
  RequestError as requestError,
  RequestPending as requestPending,
  RequestSuccess as requestSuccess,
  UnfollowError as unfollowError,
  UnfollowPending as unfollowPending,
  UnfollowSuccess as unfollowSuccess,
} from './FollowButton.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/FollowButton/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const FollowSuccess: Story = followSuccess;
export const FollowPending: Story = followPending;
export const FollowError: Story = followError;
export const RequestSuccess: Story = requestSuccess;
export const RequestPending: Story = requestPending;
export const RequestError: Story = requestError;
export const UnfollowSuccess: Story = unfollowSuccess;
export const UnfollowPending: Story = unfollowPending;
export const UnfollowError: Story = unfollowError;
export const CancelSuccess: Story = cancelSuccess;
export const CancelPending: Story = cancelPending;
export const CancelError: Story = cancelError;
