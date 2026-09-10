import { Pin } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { getCopiedStrings, resetClipboardMock } from '../../../.storybook/mocks/postClipboard';
import { ProfilePinStoryContext } from '../../../.storybook/mocks/profilePinActionBar';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PropsWithChildren } from 'react';
import type { RequestParameters, Variables } from 'relay-runtime';
import type { ProfilePinActionStoriesQuery as ProfilePinActionStoriesQueryType } from './__generated__/ProfilePinActionStoriesQuery.graphql';

type Outcome = 'success' | 'error' | 'pending';
type ProfilePinOperation = 'pin' | 'unpin';

type StoryArgs = {
  action: ProfilePinOperation;
  bodyText: string;
  onDeleteRequest: (postId: string) => void;
  onPin: () => Promise<void>;
  onUnpin: () => Promise<void>;
  outcome: Outcome;
  viewer: 'owner' | 'visitor';
};

const ProfilePinActionStoriesQuery = graphql`
  query ProfilePinActionStoriesQuery {
    node(id: "profile-pin-action-post") {
      __typename
      ... on Post {
        id
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

function useStoryPost() {
  const data = useLazyLoadQuery<ProfilePinActionStoriesQueryType>(ProfilePinActionStoriesQuery, {});
  return data.node?.__typename === 'Post' ? data.node.listItem : null;
}

function updateStoryBody(environment: ReturnType<typeof useRelayEnvironment>, bodyText: string) {
  commitLocalUpdate(environment, (store) => {
    const postRecord = store.get(storyPost.id);
    const contentRecord = postRecord?.getLinkedRecord('content');
    contentRecord?.setValue(bodyText, 'bodyText');
    contentRecord?.setValue(null, 'document');
  });
}

function Fixture({
  action,
  bodyText,
  onPin,
  onResult,
  onUnpin,
  outcome,
  viewer,
}: StoryArgs & { onResult?: (action: ProfilePinOperation) => void }) {
  const postNode = useStoryPost();
  const environment = useRelayEnvironment();
  const [currentAction, setCurrentAction] = useState(action);
  const [pending, setPending] = useState(false);
  const { showToast } = useToast();
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const focusTrigger = useRef(() => {});
  const restoreTriggerFocus = useRef(false);
  const pinned = viewer === 'visitor' || currentAction === 'unpin';

  useEffect(() => setCurrentAction(action), [action]);
  useEffect(() => updateStoryBody(environment, bodyText), [bodyText, environment]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!pending && restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      focusTrigger.current();
    }
  }, [pending]);

  const simulateRequest = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    let succeeded = false;
    try {
      await (currentAction === 'pin' ? onPin : onUnpin)();
      if (outcome === 'pending') {
        return;
      }
      succeeded = outcome === 'success';
    } catch {
      // Story Actions may reject too; never display the supplied error text.
    }
    if (!mounted.current) {
      return;
    }
    inFlight.current = false;
    restoreTriggerFocus.current = true;
    setPending(false);
    if (succeeded) {
      setCurrentAction(currentAction === 'unpin' ? 'pin' : 'unpin');
      onResult?.(currentAction);
    } else {
      showToast('고정 상태를 변경하지 못했어요. 다시 시도해 주세요.', { tone: 'danger' });
    }
  };

  if (!postNode) {
    return null;
  }

  return (
    <View style={styles.fixture}>
      <ProfilePinStoryContext
        value={{
          moreItems:
            viewer === 'owner'
              ? [
                  {
                    key: 'pin',
                    icon: Pin,
                    label: currentAction === 'unpin' ? '프로필 고정 해제' : '프로필에 고정',
                    onSelect: () => void simulateRequest(),
                  },
                ]
              : [],
          morePending: pending,
          moreSheetIconSize: 24,
          onMoreTriggerReady: (focus) => {
            focusTrigger.current = focus;
          },
        }}
      >
        <PostListItem pinned={pinned} post={postNode} />
      </ProfilePinStoryContext>
    </View>
  );
}

const storyData = { node: storyPost };
const deletionResponse = { deletePost: { postId: storyPost.id } };

function StoryProviders({
  children,
  viewer,
  onDeleteRequest,
}: PropsWithChildren<Pick<StoryArgs, 'viewer' | 'onDeleteRequest'>>) {
  const operationResponses = useMemo(
    () => ({
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
    }),
    [viewer],
  );
  const observeMutation = useCallback(
    (request: RequestParameters, variables: Variables) => {
      if (request.name === 'PostDeletionActionDeletePostMutation') {
        onDeleteRequest(variables.id as string);
      }
    },
    [onDeleteRequest],
  );
  return (
    <RelayStoryProvider
      key={viewer}
      queryData={storyData}
      operationResponses={operationResponses}
      mutationResponse={deletionResponse}
      mutationRequestObserver={observeMutation}
    >
      <SessionProvider>
        <PostActionAuthenticationProvider>
          <PostReplyCoordinatorProvider owner="list" profile={null}>
            <PostMediaViewerHostProvider>{children}</PostMediaViewerHostProvider>
          </PostReplyCoordinatorProvider>
        </PostActionAuthenticationProvider>
      </SessionProvider>
    </RelayStoryProvider>
  );
}

const meta = {
  args: {
    action: 'pin',
    bodyText: storyPost.content?.bodyText ?? '',
    onDeleteRequest: fn(),
    onPin: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onUnpin: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
    viewer: 'owner',
  },
  argTypes: {
    action: { control: 'inline-radio', options: ['pin', 'unpin'] },
    bodyText: { control: 'text' },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    viewer: { control: 'inline-radio', options: ['owner', 'visitor'] },
  },
  component: Fixture,
  decorators: [
    (Story, { args }) => {
      const [, updateArgs] = useArgs();
      return (
        <StoryProviders viewer={args.viewer} onDeleteRequest={args.onDeleteRequest}>
          <Story
            args={{
              ...args,
              onResult: (nextAction: ProfilePinOperation) =>
                updateArgs({ action: nextAction === 'unpin' ? 'pin' : 'unpin' }),
            }}
          />
        </StoryProviders>
      );
    },
  ],
  excludeStories: [
    'ErrorRecoveryFocus',
    'OwnerMenuAndDirectActions',
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
          '고정 요청과 상태 전환은 Storybook fixture의 모의 동작입니다. 실제 PostListItem·PostActionBar·메뉴·toast를 사용하지만 Pin mutation과 production 연결은 검증하지 않습니다.',
      },
    },
    controls: {
      disable: true,
      include: ['viewer', 'action', 'bodyText', 'outcome'],
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
export const VisitorPinned: Story = { args: { viewer: 'visitor' } };
export const Mobile: Story = {
  args: { action: 'unpin' },
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

export const OwnerMenuAndDirectActions: Story = {
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
      '삭제',
    ]);
    const pinMenu = body.getByRole('menu', { name: '더 보기 메뉴' });
    expect(pinMenu.getBoundingClientRect().width).toBeCloseTo(160, 0);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '프로필에 고정' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '게시글 삭제' })).toBeVisible();
    await userEvent.click(body.getByRole('menuitem', { name: '프로필에 고정' }));
    await waitFor(() => expect(args.onPin).toHaveBeenCalledTimes(1));
    expect(await canvas.findByText('고정됨')).toBeVisible();
    expect(body.queryByRole('dialog')).not.toBeInTheDocument();

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
    await waitFor(() => expect(args.onUnpin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(canvas.queryByText('고정됨')).not.toBeInTheDocument());
    expect(body.queryByRole('dialog')).not.toBeInTheDocument();
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
    expect(
      await body.findByText('고정 상태를 변경하지 못했어요. 다시 시도해 주세요.'),
    ).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(canvas.getByText('고정됨')).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(await body.findByRole('menuitem', { name: '프로필 고정 해제' }));
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
    const dialog = await body.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    expect(args.onDeleteRequest).not.toHaveBeenCalled();
    const cancel = within(dialog).getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onDeleteRequest).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '게시글 삭제' }));
    const confirmation = await body.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    await userEvent.click(within(confirmation).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(args.onDeleteRequest).toHaveBeenCalledWith(storyPost.id));
    expect(args.onDeleteRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(canvas.queryByRole('article')).not.toBeInTheDocument());
  },
};

export const ProductionWithoutPinFixture: Story = {
  render: function ProductionPost() {
    const postNode = useStoryPost();
    return postNode ? <PostListItem pinned post={postNode} /> : <></>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    expect(canvas.getByText('고정됨')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      '링크 복사',
      '삭제',
    ]);
    await userEvent.keyboard('{Escape}');
  },
};
