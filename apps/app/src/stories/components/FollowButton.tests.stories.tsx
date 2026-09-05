import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  CancelError as cancelError,
  CancelPending as cancelPending,
  CancelSuccess as cancelSuccess,
  FollowError as followError,
  FollowPending as followPending,
  FollowSuccess as followSuccess,
  Playground,
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

const playgroundCycle = (profileId: string, activeLabel: string): Story => ({
  ...Playground,
  args: { profileId, size: 'medium' },
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement);
    for (let cycle = 0; cycle < 2; cycle++) {
      await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
      await expect(canvas.findByRole('button', { name: activeLabel })).resolves.toBeEnabled();
      await userEvent.click(canvas.getByRole('button', { name: activeLabel }));
      await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
    }
    expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledTimes(4);
  },
});

export const PlaygroundFollowCycle = playgroundCycle('follow-button-followable', '팔로잉');
export const PlaygroundRequestCycle = playgroundCycle('follow-button-approval-required', '요청됨');
