import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { ProfilePinProvider, useProfilePin } from '@/components/post/ProfilePinProvider';
import { ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { SessionProvider } from '@/session/SessionProvider';
import { getCopiedStrings, resetClipboardMock } from '../../../.storybook/mocks/postClipboard';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PropsWithChildren } from 'react';
import type { RequestParameters, Variables } from 'relay-runtime';
import type { ProfilePinActionStoriesQuery as ProfilePinActionStoriesQueryType } from './__generated__/ProfilePinActionStoriesQuery.graphql';

type Outcome = 'success' | 'error' | 'pending';
type ProfilePinOperation = 'pin' | 'replace' | 'unpin';

type StoryArgs = {
  action: ProfilePinOperation;
  onDeleteRequest: (postId: string) => void;
  onPin: () => Promise<void>;
  onUnpin: () => Promise<void>;
  outcome: Outcome;
  presentation: 'mobile' | 'wide';
  viewer: 'owner' | 'visitor';
};

const ProfilePinActionStoriesQuery = graphql`
  query ProfilePinActionStoriesQuery {
    node(id: "profile-pin-action-post") {
      __typename
      ... on Post {
        id
        profile {
          id
          instance {
            kind
          }
        }
        ...PostListItem_post @alias(as: "listItem")
      }
    }
  }
`;

const storyPost = {
  ...post({
    bodyText: '프로필에 고정할 게시물입니다.',
    id: 'profile-pin-action-post',
  }),
  viewerReactions: [],
};

function storyPinnedPosts(isPinned: boolean) {
  return {
    edges: isPinned
      ? [{ cursor: 'pin-cursor', node: { __typename: 'Post' as const, id: storyPost.id } }]
      : [],
    pageInfo: {
      endCursor: isPinned ? 'pin-cursor' : null,
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: isPinned ? 'pin-cursor' : null,
    },
  };
}

function storyPinnedPostsForAction(action: ProfilePinOperation) {
  const pinnedPostId =
    action === 'unpin' ? storyPost.id : action === 'replace' ? 'profile-pin-existing-post' : null;
  return {
    edges: pinnedPostId
      ? [{ cursor: 'pin-cursor', node: { __typename: 'Post' as const, id: pinnedPostId } }]
      : [],
    pageInfo: {
      endCursor: pinnedPostId ? 'pin-cursor' : null,
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: pinnedPostId ? 'pin-cursor' : null,
    },
  };
}

function storyPostWithPinState(isPinned: boolean) {
  return {
    ...storyPost,
    profile: {
      ...storyPost.profile,
      pinnedPosts: storyPinnedPosts(isPinned),
    },
  };
}

function useStoryPost() {
  const data = useLazyLoadQuery<ProfilePinActionStoriesQueryType>(ProfilePinActionStoriesQuery, {});
  return data.node?.__typename === 'Post' && data.node.listItem
    ? { post: data.node.listItem, profile: data.node.profile }
    : null;
}

function Fixture({ presentation }: StoryArgs) {
  const postNode = useStoryPost();
  const { firstPinnedPostId } = useProfilePin();

  if (!postNode) {
    return null;
  }

  return (
    <View style={styles.fixture}>
      <PostListItem
        pinned={firstPinnedPostId === storyPost.id}
        post={postNode.post}
        presentation={presentation}
      />
    </View>
  );
}

function createStoryData(action: ProfilePinOperation) {
  return {
    node: {
      ...storyPost,
      profile: {
        ...storyPost.profile,
        pinnedPosts: storyPinnedPostsForAction(action),
      },
    },
  };
}
const deletionResponse = { deletePost: { postId: storyPost.id } };
const pinResponse = {
  pinProfilePost: {
    changed: true,
    profile: {
      id: storyPost.profile.id,
      pinnedPosts: {
        edges: [{ cursor: 'pin-cursor', node: storyPostWithPinState(true) }],
        pageInfo: {
          endCursor: 'pin-cursor',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: 'pin-cursor',
        },
      },
    },
  },
};
const unpinResponse = {
  unpinProfilePost: {
    changed: true,
    profile: {
      id: storyPost.profile.id,
      pinnedPosts: {
        edges: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
        },
      },
    },
  },
};

function profilePinQueryResponse(action: ProfilePinOperation) {
  return {
    node: {
      __typename: 'Profile',
      id: storyPost.profile.id,
      pinnedPosts: storyPinnedPostsForAction(action),
    },
  };
}

function StoryProviders({
  action,
  children,
  outcome,
  onPin,
  onUnpin,
  viewer,
  onDeleteRequest,
}: PropsWithChildren<
  Pick<StoryArgs, 'outcome' | 'onPin' | 'onUnpin' | 'viewer' | 'onDeleteRequest'> & {
    action: ProfilePinOperation;
  }
>) {
  const operationResponses = useMemo(() => {
    const pinOperationResponse =
      outcome === 'pending'
        ? { data: pinResponse, delayMs: 60_000 }
        : outcome === 'error'
          ? { error: 'pin failed' }
          : { data: pinResponse };
    const unpinOperationResponse =
      outcome === 'pending'
        ? { data: unpinResponse, delayMs: 60_000 }
        : outcome === 'error'
          ? { error: 'unpin failed' }
          : { data: unpinResponse };
    return {
      SessionProviderQuery: {
        data: {
          currentSession: {
            __typename: 'Session',
            id: 'session-story',
            selectedProfile: {
              __typename: 'Profile',
              id: viewer === 'owner' ? storyPost.profile.id : 'profile-visitor',
            },
          },
          me: { __typename: 'Account', id: 'account-story', name: 'Story' },
        },
      },
      ProfilePinProviderPinProfilePostMutation: pinOperationResponse,
      ProfilePinProviderQuery: { data: profilePinQueryResponse(action) },
      ProfilePinProviderUnpinProfilePostMutation: unpinOperationResponse,
    };
  }, [action, outcome, viewer]);
  const observeMutation = useCallback(
    (request: RequestParameters, variables: Variables) => {
      if (request.name === 'PostDeletionActionDeletePostMutation') {
        onDeleteRequest(variables.id as string);
        return;
      }
      const action = request.name.includes('Unpin') ? 'unpin' : 'pin';
      if (
        request.name === 'ProfilePinProviderPinProfilePostMutation' ||
        request.name === 'ProfilePinProviderUnpinProfilePostMutation'
      ) {
        void (action === 'pin' ? onPin() : onUnpin());
      }
    },
    [onDeleteRequest, onPin, onUnpin],
  );
  return (
    <RelayStoryProvider
      key={`${viewer}:${action}`}
      queryData={createStoryData(action)}
      operationResponses={operationResponses}
      mutationResponse={deletionResponse}
      mutationRequestObserver={observeMutation}
      actorBoundary
    >
      <SessionProvider>
        <ProfilePinProvider>
          <PostActionAuthenticationProvider>
            <PostComposerCoordinatorProvider owner="list" profile={null}>
              <PostMediaViewerHostProvider>{children}</PostMediaViewerHostProvider>
            </PostComposerCoordinatorProvider>
          </PostActionAuthenticationProvider>
        </ProfilePinProvider>
      </SessionProvider>
    </RelayStoryProvider>
  );
}

const meta = {
  args: {
    action: 'pin',
    onDeleteRequest: fn(),
    onPin: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUnpin: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
    presentation: 'wide',
    viewer: 'owner',
  },
  argTypes: {
    action: { control: 'inline-radio', options: ['pin', 'replace', 'unpin'] },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    viewer: { control: 'inline-radio', options: ['owner', 'visitor'] },
  },
  component: Fixture,
  decorators: [
    (Story, { args }) => (
      <StoryProviders
        action={args.action}
        onDeleteRequest={args.onDeleteRequest}
        onPin={args.onPin}
        onUnpin={args.onUnpin}
        outcome={args.outcome}
        viewer={args.viewer}
      >
        <Story args={args} />
      </StoryProviders>
    ),
  ],
  excludeStories: [
    'ErrorRecoveryFocus',
    'OwnerMenuAndConfirmedActions',
    'PendingContract',
    'SheetIconContract',
    'VisitorMenuContract',
    'ExistingDeletionFlow',
    'ProductionWithoutPinFixture',
  ],
  parameters: {
    docs: {
      description: {
        component:
          '실제 PostListItem·PostActionSurface·PostActionBar와 Relay pin/unpin mutation을 사용합니다. Storybook 네트워크 응답으로 성공·pending·실패 상태를 확인합니다.',
      },
    },
    controls: {
      disable: true,
      include: ['viewer', 'action', 'outcome'],
    },
    relay: { data: { node: storyPost } },
  },
  title: 'KOSMO/Patterns/Profile/Pin Action',
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { disable: false } },
};
export const OwnerPinned: Story = { args: { action: 'unpin' } };
export const OwnerReplacement: Story = { args: { action: 'replace' } };
export const VisitorPinned: Story = { args: { viewer: 'visitor' } };
export const Mobile: Story = {
  args: { action: 'unpin', presentation: 'mobile' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
};
export const Compact: Story = {
  args: { action: 'unpin' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  parameters: { layout: 'fullscreen' },
};
export const Full: Story = {
  args: { action: 'unpin' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
  parameters: { layout: 'fullscreen' },
};

export const SheetIconContract: Story = {
  decorators: [
    (Story) => (
      <ActionMenuPresentationProvider presentation="sheet">
        <Story />
      </ActionMenuPresentationProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
    for (const item of await body.findAllByRole('menuitem')) {
      expect(item.querySelector('svg')).toHaveAttribute('width', '24');
      expect(item.querySelector('svg')).toHaveAttribute('height', '24');
    }
    await userEvent.keyboard('{Escape}');
  },
};

export const OwnerMenuAndConfirmedActions: Story = {
  play: async ({ args, canvasElement }) => {
    args.onPin.mockClear();
    args.onUnpin.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    expect(trigger).not.toHaveAttribute('aria-pressed');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    await userEvent.click(trigger);
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      '링크 복사',
      '프로필에 고정',
      '신고',
      '삭제',
    ]);
    const pinMenu = body.getByRole('menu', { name: '더 보기 메뉴' });
    expect(pinMenu.getBoundingClientRect().width).toBeCloseTo(160, 0);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '프로필에 고정' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '게시글 삭제' })).toBeVisible();
    await userEvent.click(body.getByRole('menuitem', { name: '프로필에 고정' }));
    expect(args.onPin).not.toHaveBeenCalled();
    let pinDialog = await body.findByRole('alertdialog', { name: '프로필에 고정할까요?' });
    expect(within(pinDialog).getByText(/게시글은 삭제되지 않아요/)).toBeVisible();
    const cancel = within(pinDialog).getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onPin).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필에 고정' }));
    pinDialog = await body.findByRole('alertdialog', { name: '프로필에 고정할까요?' });
    await userEvent.click(within(pinDialog).getByRole('button', { name: '고정' }));
    await waitFor(() => expect(args.onPin).toHaveBeenCalledTimes(1));
    expect(await canvas.findByText('고정됨')).toBeVisible();
    expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();

    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    const unpinMenu = await body.findByRole('menu', { name: '더 보기 메뉴' });
    expect(unpinMenu.getBoundingClientRect().width).toBeCloseTo(160, 0);
    const profileLink = canvas.getByRole('link', { name: /코스모 작가/ });
    profileLink.focus();
    await waitFor(() =>
      expect(body.queryByRole('menuitem', { name: '프로필 고정 해제' })).not.toBeInTheDocument(),
    );
    expect(profileLink).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필 고정 해제' }));
    expect(args.onUnpin).not.toHaveBeenCalled();
    const unpinDialog = await body.findByRole('alertdialog', { name: '프로필 고정을 해제할까요?' });
    expect(within(unpinDialog).getByRole('button', { name: '취소' })).toBeVisible();
    await userEvent.click(within(unpinDialog).getByRole('button', { name: '고정 해제' }));
    await waitFor(() => expect(args.onUnpin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(canvas.queryByText('고정됨')).not.toBeInTheDocument());
    expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();
  },
};

export const VisitorMenuContract: Story = {
  args: { viewer: 'visitor' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      '링크 복사',
      '신고',
      '뮤트',
    ]);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '뮤트' })).toBeVisible();
    expect(body.queryByRole('menuitem', { name: '프로필에 고정' })).not.toBeInTheDocument();
    expect(body.queryByRole('menuitem', { name: '게시글 삭제' })).not.toBeInTheDocument();
    resetClipboardMock();
    await userEvent.click(body.getByRole('menuitem', { name: '링크 복사' }));
    await waitFor(() =>
      expect(getCopiedStrings()).toEqual([
        `${window.location.origin}/${storyPost.profile.relativeHandle}/${storyPost.id}`,
      ]),
    );
  },
};

export const PendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onPin.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필에 고정' }));
    const dialog = await body.findByRole('alertdialog', { name: '프로필에 고정할까요?' });
    expect(args.onPin).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '고정' }));
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'true'));
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    trigger.click();
    await userEvent.keyboard('{Enter}');
    expect(body.queryByRole('menuitem', { name: '프로필에 고정' })).not.toBeInTheDocument();
    expect(canvas.queryByText('고정됨')).not.toBeInTheDocument();
    expect(args.onPin).toHaveBeenCalledTimes(1);
  },
};

export const ErrorRecoveryFocus: Story = {
  args: { action: 'unpin', outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onUnpin.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필 고정 해제' }));
    const dialog = await body.findByRole('alertdialog', { name: '프로필 고정을 해제할까요?' });
    await userEvent.click(within(dialog).getByRole('button', { name: '고정 해제' }));
    expect(
      await body.findByText('고정 상태를 변경하지 못했어요. 다시 시도해 주세요.'),
    ).toBeVisible();
    expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(canvas.getByText('고정됨')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필 고정 해제' }));
    await userEvent.click(
      within(await body.findByRole('alertdialog', { name: '프로필 고정을 해제할까요?' })).getByRole(
        'button',
        { name: '고정 해제' },
      ),
    );
    await waitFor(() => expect(args.onUnpin).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(canvas.getByText('고정됨')).toBeVisible();
  },
};

const styles = StyleSheet.create({
  fixture: { alignSelf: 'center', maxWidth: 600, width: '100%' },
});

export const ExistingDeletionFlow: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDeleteRequest.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '게시글 삭제' }));
    const dialog = await body.findByRole('alertdialog', { name: '게시글을 삭제할까요?' });
    expect(args.onDeleteRequest).not.toHaveBeenCalled();
    const cancel = within(dialog).getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onDeleteRequest).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '게시글 삭제' }));
    const confirmation = await body.findByRole('alertdialog', { name: '게시글을 삭제할까요?' });
    await userEvent.click(within(confirmation).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(args.onDeleteRequest).toHaveBeenCalledWith(storyPost.id));
    expect(args.onDeleteRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(canvas.queryByRole('article')).not.toBeInTheDocument());
  },
};

export const ProductionWithoutPinFixture: Story = {
  render: function ProductionPost() {
    const postNode = useStoryPost();
    return postNode ? <PostListItem post={postNode.post} presentation="wide" /> : <></>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      '링크 복사',
      '프로필에 고정',
      '신고',
      '삭제',
    ]);
    await userEvent.keyboard('{Escape}');
  },
};
