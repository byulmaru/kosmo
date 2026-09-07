import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { NotificationListItemView } from '@/components/notification/NotificationListItemView';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationListItemViewProps } from '@/components/notification/NotificationListItemView';
import type { NotificationListItemStoriesQuery as Query } from './__generated__/NotificationListItemStoriesQuery.graphql';

const thumbnail = {
  id: 'notification-thumbnail',
  altText: '보라색 하늘',
  url:
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8b7dea"/></svg>',
    ),
};
const author = profile({ id: 'notification-reply-author', displayName: '코스모 사용자' });
const replyPost = {
  ...post({
    id: 'notification-reply-post',
    profile: author,
    bodyText: '코스모에서 함께 나누고 싶은 오늘의 이야기입니다.',
  }),
  replyCount: 12,
  repostCount: 3,
  viewerReactions: [],
};

export type NotificationStoryArgs = {
  kind: NotificationListItemViewProps['kind'];
  name: string;
  grouped: boolean;
  otherActorCount: number;
  timestamp: string;
  unread: boolean;
  pending: boolean;
  disabled: boolean;
  bodyText: string;
  contentWarning: string;
  hasMedia: boolean;
  sensitiveMedia: boolean;
  unavailable: boolean;
  containerWidth: 'auto' | number;
  onNavigate: ReturnType<typeof fn>;
};
type Args = NotificationStoryArgs;

function ReplyPost() {
  const data = useLazyLoadQuery<Query>(
    graphql`
      query NotificationListItemStoriesQuery {
        node(id: "notification-reply-post") {
          ... on Post {
            ...PostListItem_post @alias(as: "post")
          }
        }
        composer: node(id: "notification-viewer") {
          ... on Profile {
            ...ReplyComposerSurface_profile @alias(as: "replyProfile")
          }
        }
      }
    `,
    {},
  );
  if (!data.node?.post) {
    throw new Error('Reply story Post fixture is missing.');
  }
  return (
    <SessionProvider>
      <PostActionAuthenticationProvider>
        <PostReplyCoordinatorProvider owner="list" profile={data.composer?.replyProfile ?? null}>
          <PostMediaViewerHostProvider>
            <PostListItem post={data.node.post} showDivider={false} showReplyAttribution={false} />
          </PostMediaViewerHostProvider>
        </PostReplyCoordinatorProvider>
      </PostActionAuthenticationProvider>
    </SessionProvider>
  );
}

export function NotificationExample(args: Args) {
  const actor = { id: 'notification-actor', name: args.name };
  const shared = {
    disabled: args.disabled,
    onNavigate: args.onNavigate,
    pending: args.pending,
    timestamp: args.timestamp,
    unread: args.unread,
  };
  if (args.kind === 'reply') {
    return (
      <NotificationListItemView
        {...shared}
        actor={actor}
        href="/@kosmo/notification-reply-post"
        kind="reply"
      >
        <ReplyPost />
      </NotificationListItemView>
    );
  }
  const actors = args.grouped
    ? ([
        actor,
        { id: 'actor-2', name: '은하 관측자' },
        { id: 'actor-3', name: '우주 여행자' },
      ] as const)
    : ([actor] as const);
  const summary = {
    actors,
    totalActorCount: args.grouped ? Math.max(3, (args.otherActorCount ?? 3) + 1) : 1,
  };
  if (args.kind === 'follow' || args.kind === 'followRequest') {
    return (
      <NotificationListItemView
        {...shared}
        {...summary}
        href={args.kind === 'follow' ? '/@kosmo' : '/follow-requests'}
        kind={args.kind}
      />
    );
  }
  return (
    <NotificationListItemView
      {...shared}
      {...summary}
      href="/@kosmo/notification-related-post"
      kind={args.kind}
      preview={
        args.unavailable
          ? null
          : {
              bodyText: args.bodyText,
              contentWarning: args.contentWarning || null,
              media: args.hasMedia ? [thumbnail] : [],
              sensitiveMedia: args.sensitiveMedia,
            }
      }
    />
  );
}

const meta = {
  title: 'KOSMO/Patterns/Notification List Item',
  args: {
    kind: 'follow',
    name: '별빛 여행자',
    grouped: false,
    otherActorCount: 3,
    timestamp: '5분 전',
    unread: false,
    pending: false,
    disabled: false,
    bodyText: '새 디자인 시스템을 적용한 게시글의 한 줄 미리보기입니다.',
    contentWarning: '',
    hasMedia: false,
    sensitiveMedia: false,
    unavailable: false,
    containerWidth: 600,
    onNavigate: fn(),
  },
  argTypes: {
    kind: {
      control: 'select',
      options: ['follow', 'followRequest', 'reaction', 'repost', 'reply'],
    },
    name: { control: 'text' },
    timestamp: { control: 'text' },
    grouped: { control: 'boolean', if: { arg: 'kind', neq: 'reply' } },
    otherActorCount: { control: { type: 'number', min: 2, step: 1 }, if: { arg: 'grouped' } },
    unread: { control: 'boolean' },
    pending: { control: 'boolean' },
    disabled: { control: 'boolean' },
    bodyText: { control: 'text' },
    contentWarning: { control: 'text' },
    hasMedia: { control: 'boolean' },
    sensitiveMedia: { control: 'boolean' },
    unavailable: { control: 'boolean' },
    containerWidth: { control: 'select', options: [320, 390, 600, 720, 'auto'] },
  },
  decorators: [
    (Story, context) => (
      <View
        style={{
          width: context.args.containerWidth === 'auto' ? '100%' : context.args.containerWidth,
          maxWidth: '100%',
        }}
      >
        <Story />
      </View>
    ),
  ],
  excludeStories: [
    'NotificationExample',
    'ActivationContract',
    'PendingContract',
    'CompositionContract',
    'ProtectionContract',
  ],
  parameters: {
    layout: 'fullscreen',
    relay: {
      operationResponses: {
        NotificationListItemStoriesQuery: {
          data: { node: replyPost, composer: profile({ id: 'notification-viewer' }) },
        },
        SessionProviderQuery: {
          data: {
            currentSession: {
              id: 'notification-session',
              selectedProfile: { id: 'notification-viewer' },
            },
            me: { id: 'notification-account', name: 'Story' },
          },
        },
      },
    },
  },
  render: (args) => <NotificationExample {...args} />,
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const GroupedKinds: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      {(['follow', 'followRequest', 'reaction', 'repost'] as const).map((kind) => (
        <NotificationExample
          key={kind}
          {...args}
          grouped
          kind={kind}
          hasMedia={kind === 'repost'}
        />
      ))}
    </View>
  ),
};

export const Reply: Story = { args: { kind: 'reply' } };

export const LongContent: Story = {
  args: {
    kind: 'reaction',
    grouped: true,
    name: '아주 긴 표시 이름을 사용하는 머나먼 은하의 여행자',
    timestamp: '2026년 9월 7일',
    bodyText: '긴 첫 번째 줄입니다. '.repeat(20) + '\n두 번째 줄입니다.',
    hasMedia: true,
    containerWidth: 320,
  },
};

export const ProtectedContent: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      <NotificationExample
        {...args}
        kind="reaction"
        hasMedia
        contentWarning="내용 확인에 주의가 필요합니다"
      />
      <NotificationExample {...args} kind="repost" hasMedia sensitiveMedia />
      <NotificationExample {...args} kind="reaction" unavailable />
    </View>
  ),
};

export const ReadAndUnavailableStates: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      <NotificationExample {...args} unread={false} name="읽은 알림" />
      <NotificationExample {...args} unread />
      <NotificationExample {...args} pending name="이동 처리 중" />
      <NotificationExample {...args} disabled name="더 이상 접근할 수 없는 알림" />
    </View>
  ),
};

export const ActivationContract: Story = {
  args: { kind: 'followRequest' },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', { name: /팔로우 요청 관리 화면으로 이동/ });
    await expect(link).toHaveAttribute('href', '/follow-requests');
    await expect(canvas.queryByRole('button', { name: /수락/ })).not.toBeInTheDocument();
    await userEvent.tab();
    await expect(link).toHaveFocus();
    await expect(link).toHaveStyle({ outlineWidth: '2px' });
    await userEvent.keyboard('{Enter}');
    await expect(args.onNavigate).toHaveBeenCalledOnce();
  },
};

function PendingExample(args: Args) {
  const [pending, setPending] = useState(false);
  return (
    <NotificationListItemView
      actors={[{ id: 'pending-actor', name: args.name }]}
      href="/@kosmo"
      kind="follow"
      onNavigate={() => {
        args.onNavigate();
        setPending(true);
      }}
      pending={pending}
      timestamp={args.timestamp}
    />
  );
}

export const PendingContract: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => <PendingExample {...args} />,
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link'));
    const pending = canvas.getByRole('link');
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await expect(pending).toHaveAttribute('aria-disabled', 'true');
    await expect(pending).not.toHaveAttribute('href');
    await expect(pending).toHaveStyle({ pointerEvents: 'none' });
    fireEvent.click(pending);
    await expect(args.onNavigate).toHaveBeenCalledOnce();
  },
};

export const CompositionContract: Story = {
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View>
      <View testID="reaction-notification">
        <NotificationExample {...args} kind="reaction" grouped hasMedia unread />
      </View>
      <View testID="reply-notification">
        <NotificationExample {...args} kind="reply" unread />
      </View>
    </View>
  ),
  play: async ({ args, canvasElement }) => {
    args.onNavigate.mockClear();
    const canvas = within(canvasElement);
    const reaction = within(canvas.getByTestId('reaction-notification'));
    const surface = reaction.getByTestId('notification-item-surface');
    const excerpt = reaction.getByText(args.bodyText);
    const unreadBackground = getComputedStyle(surface).backgroundColor;
    await expect(unreadBackground).not.toBe('rgba(0, 0, 0, 0)');
    await userEvent.hover(excerpt);
    await expect(getComputedStyle(surface).backgroundColor).toBe(unreadBackground);
    await expect(reaction.getByTestId('notification-hover-overlay')).toHaveStyle({
      pointerEvents: 'none',
    });
    await userEvent.click(excerpt);
    await expect(args.onNavigate).toHaveBeenCalledOnce();
    await userEvent.click(reaction.getByTestId('post-media-frame-notification-thumbnail'));
    await expect(args.onNavigate).toHaveBeenCalledTimes(2);
    await userEvent.unhover(excerpt);
    await expect(reaction.getByText(/외 3명/)).toBeInTheDocument();
    await expect(reaction.queryByRole('button')).not.toBeInTheDocument();
    await expect(reaction.getByTestId('post-media-frame-notification-thumbnail')).toHaveStyle({
      width: '64px',
      height: '64px',
    });
    const reply = within(canvas.getByTestId('reply-notification'));
    const replySurface = reply.getByTestId('notification-item-surface');
    const replyPost = reply.getByTestId('post-list-standard-row');
    await expect(replySurface).toContainElement(replyPost);
    await expect(getComputedStyle(replySurface).backgroundColor).toBe(unreadBackground);
    await userEvent.hover(replyPost);
    await expect(getComputedStyle(replySurface).backgroundColor).toBe(unreadBackground);
    await expect(reply.getByTestId('notification-hover-overlay')).toBeInTheDocument();
    const action = await reply.findByRole('button', { name: '답글' });
    await expect(action.closest('a')).toBeNull();
    await expect(reply.getByTestId('post-list-standard-row')).toBeInTheDocument();
    await expect(reply.getByRole('button', { name: /더 보기/ })).toBeInTheDocument();
    await userEvent.click(reply.getByRole('button', { name: /더 보기/ }));
    await expect(args.onNavigate).toHaveBeenCalledTimes(2);
  },
};

export const ProtectionContract: Story = {
  ...ProtectedContent,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('내용 경고: 내용 확인에 주의가 필요합니다')).toBeInTheDocument();
    await expect(canvas.getByText('게시글을 볼 수 없습니다')).toBeInTheDocument();
    await expect(
      canvas.queryByTestId('post-media-image-notification-thumbnail'),
    ).not.toBeInTheDocument();
    await expect(canvas.getAllByText(args.bodyText)).toHaveLength(1);
  },
};
