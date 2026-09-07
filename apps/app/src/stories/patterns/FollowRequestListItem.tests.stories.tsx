import { expect, userEvent, waitFor, within } from 'storybook/test';
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
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/FollowRequestListItem/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutContract: Story = layoutContract;
export const ApprovePending: Story = approvePending;
export const RejectPending: Story = rejectPending;
export const ApproveFailureAndRetry: Story = approveFailureAndRetry;
export const RejectFailureAndRetry: Story = rejectFailureAndRetry;

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
