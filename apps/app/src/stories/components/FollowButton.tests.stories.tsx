import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { profile } from '../fixtures';
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
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
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
  parameters: { ...Playground.parameters, controls: { disable: true } },
  args: { profileId },
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

const blockedTarget = profile({ id: 'follow-button-followable' });
const blockedProfile = profile({
  ...blockedTarget,
  viewerState: {
    isSelf: false,
    follow: null,
    followRequest: null,
    profileBlock: { id: 'follow-button-block', targetProfile: blockedTarget },
  },
});
const unblockRequests = fn();

export const UnblockFailureRetry: Story = {
  args: { profileId: blockedProfile.id },
  beforeEach: () => unblockRequests.mockClear(),
  parameters: {
    relay: {
      data: {
        currentSession: { id: 'follow-button-session', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: [blockedProfile],
      },
      mutationRequestObserver: unblockRequests,
      operationResponses: {
        ProfileBlockControllerUnblockMutation: {
          sequence: [
            { delayMs: 200, error: 'offline' },
            { data: { unblockProfile: { success: true, profileBlockId: 'follow-button-block' } } },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await canvas.findByRole('button', { name: /차단 해제/ });
    await userEvent.click(trigger);
    let dialog = within(await page.findByRole('dialog'));
    await waitFor(() => expect(dialog.getByRole('button', { name: '취소' })).toHaveFocus());
    await userEvent.click(dialog.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(unblockRequests).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    dialog = within(await page.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: '차단 해제' }));
    expect(dialog.getByRole('button', { name: '취소' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(page.getByRole('dialog')).toBeVisible();
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(await page.findByRole('alert')).toHaveTextContent(
      '차단을 해제하지 못했어요. 다시 시도해 주세요.',
    );
    expect(trigger).toBeEnabled();

    await userEvent.click(trigger);
    dialog = within(await page.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: '차단 해제' }));
    await expect(canvas.findByRole('button', { name: '팔로우' })).resolves.toBeEnabled();
    expect(unblockRequests).toHaveBeenCalledTimes(2);
    expect(unblockRequests.mock.calls.map(([, variables]) => variables)).toEqual([
      { id: 'follow-button-block' },
      { id: 'follow-button-block' },
    ]);
  },
};
