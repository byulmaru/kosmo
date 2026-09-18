import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, within } from 'storybook/test';
import { NotificationListItemView } from '@/components/notification/NotificationListItemView';
import { QuoteNotificationPost } from '@/components/notification/QuoteNotificationPost';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QuoteNotificationPostTestsQuery } from './__generated__/QuoteNotificationPostTestsQuery.graphql';

const quoteAuthor = profile({
  displayName: '인용 작성자',
  handle: 'quote-author',
  id: 'notification-quote-author',
  relativeHandle: '@quote-author',
});
const quotePost = {
  ...post({
    bodyText: '알림에서 확인할 인용글 본문입니다.',
    id: 'notification-quote-post',
    profile: quoteAuthor,
    repostSource: post({
      bodyText: '인용된 원문 미리보기입니다.',
      id: 'notification-quote-source',
      profile: profile({
        displayName: '원문 작성자',
        handle: 'source-author',
        id: 'notification-quote-source-author',
        relativeHandle: '@source-author',
      }),
    }),
  }),
  viewerReactions: [],
};

const QuoteNotificationPostTestsQuery = graphql`
  query QuoteNotificationPostTestsQuery {
    quote: node(id: "notification-quote-post") {
      ... on Post {
        ...QuoteNotificationPost_post @alias(as: "post")
      }
    }
    composer: node(id: "notification-viewer") {
      ... on Profile {
        ...ReplyComposerSurface_profile @alias(as: "replyProfile")
      }
    }
  }
`;

function QuoteExample({ onActivate }: { onActivate: ReturnType<typeof fn> }) {
  const data = useLazyLoadQuery<QuoteNotificationPostTestsQuery>(
    QuoteNotificationPostTestsQuery,
    {},
  );
  if (!data.quote?.post) {
    throw new Error('Quote story Post fixture is missing.');
  }

  return (
    <SessionProvider>
      <PostActionAuthenticationProvider>
        <PostComposerCoordinatorProvider owner="list" profile={data.composer?.replyProfile ?? null}>
          <PostMediaViewerHostProvider>
            <NotificationListItemView kind="quote" unread>
              <QuoteNotificationPost onActivate={onActivate} post={data.quote.post} />
            </NotificationListItemView>
          </PostMediaViewerHostProvider>
        </PostComposerCoordinatorProvider>
      </PostActionAuthenticationProvider>
    </SessionProvider>
  );
}

const meta = {
  title: 'KOSMO/Patterns/Quote Notification Post/Tests',
  args: { onActivate: fn() },
  parameters: {
    layout: 'fullscreen',
    relay: {
      operationResponses: {
        QuoteNotificationPostTestsQuery: {
          data: { quote: quotePost, composer: profile({ id: 'notification-viewer' }) },
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
  render: (args) => <QuoteExample {...args} />,
} satisfies Meta<{ onActivate: ReturnType<typeof fn> }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PresentationContract: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('quote-notification-post')).toBeVisible();
    await expect(canvas.getByTestId('quote-notification-kind')).toBeVisible();
    await expect(canvas.getByTestId('notification-post-avatar')).toHaveStyle({
      height: '24px',
      width: '24px',
    });
    await expect(canvas.getByText('읽지 않은 알림')).toBeInTheDocument();
    await expect(
      getComputedStyle(canvas.getByTestId('notification-item-surface')).backgroundColor,
    ).not.toBe('rgba(0, 0, 0, 0)');
    await expect(canvas.getByTestId('notification-reason')).toHaveTextContent(
      '회원님의 게시글을 인용했습니다',
    );
    await expect(canvas.getAllByText('인용 작성자')).toHaveLength(1);
    await expect(canvas.getByText('알림에서 확인할 인용글 본문입니다.')).toBeVisible();
    await expect(canvas.getByText('인용된 원문 미리보기입니다.')).toBeVisible();
    await expect(canvas.getByRole('toolbar', { name: '액션 바' })).toBeVisible();
    await expect(canvas.getByTestId('notification-post-author')).toHaveAttribute(
      'href',
      '/@quote-author',
    );
    await expect(canvas.getByRole('link', { name: '원문 게시글 보기' })).toHaveAttribute(
      'href',
      '/@source-author/notification-quote-source',
    );
    await expect(canvas.getByText('회원님의 게시글을 인용했습니다').closest('a')).toBeNull();

    await userEvent.click(canvas.getByText('인용된 원문 미리보기입니다.'));
    await expect(args.onActivate).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByText('알림에서 확인할 인용글 본문입니다.'));
    await expect(args.onActivate).toHaveBeenCalledOnce();
  },
};
