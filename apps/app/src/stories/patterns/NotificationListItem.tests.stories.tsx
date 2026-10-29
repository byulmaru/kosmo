import { expect, fn, userEvent, within } from 'storybook/test';
import baseMeta, {
  ActivationContract as activation,
  CompositionContract as composition,
  OperationalActivationContract as operationalActivation,
  PendingContract as pending,
  PostNotificationRailActivationContract as postNotificationRailActivation,
  ProtectionContract as protection,
  ReactionRepostProfileTargetsContract as reactionRepostProfileTargets,
  ReplyActionsContract as replyActions,
  ReplyLayoutContract as replyLayout,
  ReplyQuoteContract as replyQuote,
  ReplyRailActivationContract as replyRailActivation,
} from './NotificationListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationStoryArgs } from './NotificationListItem.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Notification List Item/Tests',
} satisfies Meta<NotificationStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PlaygroundNotificationObjectReachesView: Story = {
  args: {
    notification: {
      body: '직접 전달한 공지 본문',
      href: { href: '/notifications?source=playground', kind: 'internal' },
      kind: 'operational',
      timestamp: '방금 전',
      title: '직접 전달한 공지',
      unread: true,
    },
    onNavigate: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', {
      name: /직접 전달한 공지.*직접 전달한 공지 본문.*읽지 않은 알림.*알림 열기/,
    });
    await expect(link).toHaveAttribute('href', '/notifications?source=playground');
    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenCalledOnce();
  },
};

export const ActivationContract: Story = activation;
export const OperationalActivationContract: Story = operationalActivation;
export const PendingContract: Story = pending;
export const CompositionContract: Story = composition;
export const ProtectionContract: Story = protection;
export const ReplyLayoutContract: Story = replyLayout;
export const ReplyQuoteContract: Story = replyQuote;

export const ReplyActionsContract: Story = replyActions;
export const ReplyRailActivationContract: Story = replyRailActivation;
export const ReactionRepostProfileTargetsContract: Story = reactionRepostProfileTargets;
export const PostNotificationRailActivationContract: Story = postNotificationRailActivation;
