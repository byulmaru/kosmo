import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import baseMeta, {
  RepresentativeStates as representativeStates,
} from './FollowRequestListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const mutationRequestObserver = fn().mockName('FollowRequestListItem mutation');
const approveRetryResponse = {
  approveProfileFollowRequest: {
    followeeProfile: { followersCount: 1, id: 'follow-request-story-followee' },
    followerProfile: { id: 'follow-request-story-requester', followingCount: 2 },
    profileFollow: {
      follower: { id: 'follow-request-story-requester' },
      followee: { id: 'follow-request-story-followee' },
      id: 'follow-request-story-follow',
    },
    profileFollowRequestId: 'follow-request-story-other',
  },
};
const approvePartialResponse = {
  approveProfileFollowRequest: {
    ...approveRetryResponse.approveProfileFollowRequest,
    profileFollowRequestId: 'follow-request-story-available',
  },
};
const rejectRetryResponse = {
  rejectProfileFollowRequest: {
    followeeProfile: { id: 'follow-request-story-followee' },
    profileFollowRequestId: 'follow-request-story-other',
  },
};

const meta = {
  ...baseMeta,
  beforeEach: () => mutationRequestObserver.mockClear(),
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/FollowRequestListItem/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutContract: Story = {
  ...representativeStates,
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 승인',
    });
    const rejectButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 거절',
    });
    expect(approveButton).toBeEnabled();
    expect(rejectButton).toBeEnabled();
    expect(approveButton.getBoundingClientRect().height).toBe(32);
    expect(approveButton.getBoundingClientRect().width).toBe(32);
    expect(approveButton.querySelector('svg')).toBeInTheDocument();
    expect(rejectButton.getBoundingClientRect().height).toBe(32);
    expect(rejectButton.getBoundingClientRect().width).toBe(32);
    expect(rejectButton.querySelector('svg')).toBeInTheDocument();
    const requesterLink = canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' });
    const row = requesterLink.parentElement;
    const actionArea = approveButton.parentElement;
    if (!row || !actionArea) {
      throw new Error('FollowRequestListItem LayoutContract requires row and action parents.');
    }
    const rowBounds = row.getBoundingClientRect();
    const requesterLinkBounds = requesterLink.getBoundingClientRect();
    const rowBorderBottom = Number.parseFloat(getComputedStyle(row).borderBottomWidth);
    expect(rowBounds.height).toBe(64);
    expect(requesterLinkBounds.left).toBeCloseTo(rowBounds.left);
    expect(requesterLinkBounds.top).toBeCloseTo(rowBounds.top);
    expect(requesterLinkBounds.bottom).toBeCloseTo(rowBounds.bottom - rowBorderBottom);
    expect(requesterLinkBounds.right).toBeLessThanOrEqual(actionArea.getBoundingClientRect().left);
    expect(canvas.getByLabelText('별빛 여행자 프로필 이미지').querySelector('img')).toHaveAttribute(
      'src',
      appleTouchIconUrl,
    );
    expect(canvas.getByText('확인할 수 없는 프로필')).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 승인' }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: '확인할 수 없는 프로필 팔로우 요청 거절' }),
    ).toBeEnabled();
  },
};

export const ApprovePending: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' })).toBeDisabled();
  },
};

export const RejectPending: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }));
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' })).toBeDisabled();
  },
};

export const ApproveFailureAndRetry: Story = {
  parameters: {
    relay: {
      mutationRequestObserver,
      operationResponses: {
        FollowRequestListItemApproveMutation: {
          sequence: [
            { data: approvePartialResponse, errors: [{ message: '승인 mutation 실패' }] },
            { data: approveRetryResponse },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 승인',
    });
    const row = approveButton.parentElement?.parentElement;
    await userEvent.click(approveButton);
    const alert = await canvas.findByRole('alert');
    expect(alert).toHaveTextContent('팔로우 요청을 승인하지 못했어요');
    expect(
      getComputedStyle(within(alert).getByText(/승인하지 못했어요/).parentElement!).borderLeftColor,
    ).toBe('rgb(180, 35, 24)');
    expect(row?.contains(alert)).toBe(false);
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }));
    expect(mutationRequestObserver).toHaveBeenCalledTimes(2);
    await expect(
      canvas.findByRole('button', { name: '별빛 여행자 팔로우 요청 승인' }),
    ).resolves.toBeEnabled();
  },
};

export const RejectFailureAndRetry: Story = {
  parameters: {
    relay: {
      mutationRequestObserver,
      operationResponses: {
        FollowRequestListItemRejectMutation: {
          sequence: [{ error: '거절 mutation 실패' }, { data: rejectRetryResponse }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rejectButton = canvas.getByRole('button', {
      name: '별빛 여행자 팔로우 요청 거절',
    });
    const row = rejectButton.parentElement?.parentElement;
    await userEvent.click(rejectButton);
    const alert = await canvas.findByRole('alert');
    expect(alert).toHaveTextContent('팔로우 요청을 거절하지 못했어요');
    expect(
      getComputedStyle(within(alert).getByText(/거절하지 못했어요/).parentElement!).borderLeftColor,
    ).toBe('rgb(180, 35, 24)');
    expect(row?.contains(alert)).toBe(false);
    expect(canvas.getByRole('link', { name: '별빛 여행자 프로필로 이동' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }));
    expect(mutationRequestObserver).toHaveBeenCalledTimes(2);
    await expect(
      canvas.findByRole('button', { name: '별빛 여행자 팔로우 요청 거절' }),
    ).resolves.toBeEnabled();
  },
};

export const ActionPressedFeedback: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pointerUser = userEvent.setup();

    for (const label of ['승인', '거절']) {
      const button = canvas.getByRole('button', {
        name: `별빛 여행자 팔로우 요청 ${label}`,
      });

      await pointerUser.pointer({ keys: '[MouseLeft>]', target: button });
      await waitFor(() => expect(getComputedStyle(button).opacity).toBe('0.7'));
      await pointerUser.pointer({ target: canvasElement });
      await pointerUser.pointer({ keys: '[/MouseLeft]', target: canvasElement });

      expect(button).toBeEnabled();
      await waitFor(() => expect(getComputedStyle(button).opacity).toBe('1'));
    }
  },
};
