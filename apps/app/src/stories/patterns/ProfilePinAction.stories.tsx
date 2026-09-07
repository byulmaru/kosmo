import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { commitLocalUpdate } from 'relay-runtime';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { ProfilePinAction } from '@/components/profile/ProfilePinAction';
import { ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { post } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilePinOperation } from '@/components/profile/ProfilePinAction';
import type { ProfilePinActionStoriesQuery as ProfilePinActionStoriesQueryType } from './__generated__/ProfilePinActionStoriesQuery.graphql';

type Outcome = 'success' | 'error' | 'pending';

type StoryArgs = {
  action: ProfilePinOperation;
  bodyText: string;
  onCopyLink: () => void;
  onDelete: () => void;
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
  if (data.node?.__typename !== 'Post' || !data.node.listItem) {
    throw new Error('ProfilePinActionStoriesQuery must return one Post fixture.');
  }
  return { id: data.node.id, post: data.node.listItem };
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
  onCopyLink,
  onDelete,
  onPin,
  onResult,
  onUnpin,
  outcome,
  viewer,
}: StoryArgs & { onResult?: (action: ProfilePinOperation) => void }) {
  const { id: postId, post: postNode } = useStoryPost();
  const environment = useRelayEnvironment();
  const [currentAction, setCurrentAction] = useState(action);
  const pinned = viewer === 'visitor' || currentAction === 'unpin';

  useEffect(() => setCurrentAction(action), [action]);
  useEffect(() => updateStoryBody(environment, bodyText), [bodyText, environment]);

  const onAction = async (nextAction: ProfilePinOperation) => {
    await (nextAction === 'pin' ? onPin : onUnpin)();
    if (outcome === 'pending') {
      await new Promise<void>(() => undefined);
    }
    if (outcome === 'error') {
      throw new Error('요청 실패');
    }
    setCurrentAction(nextAction === 'unpin' ? 'pin' : 'unpin');
    onResult?.(nextAction);
  };

  if (viewer === 'visitor') {
    return (
      <View style={styles.fixture}>
        <ProfilePinAction onCopyLink={onCopyLink} postId={postId} viewer="visitor">
          {(more) => <PostListItem more={more} pinned={pinned} post={postNode} />}
        </ProfilePinAction>
      </View>
    );
  }

  return (
    <View style={styles.fixture}>
      <ProfilePinAction
        action={currentAction}
        onAction={onAction}
        onCopyLink={onCopyLink}
        onDelete={onDelete}
        postId={postId}
        viewer="owner"
      >
        {(more) => <PostListItem more={more} pinned={pinned} post={postNode} />}
      </ProfilePinAction>
    </View>
  );
}

function StoryRender(args: StoryArgs) {
  const [, updateArgs] = useArgs();
  return (
    <Fixture
      {...args}
      onResult={(nextAction) => updateArgs({ action: nextAction === 'unpin' ? 'pin' : 'unpin' })}
    />
  );
}

const meta = {
  args: {
    action: 'pin',
    bodyText: storyPost.content?.bodyText ?? '',
    onCopyLink: fn(),
    onDelete: fn(),
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
    (Story) => (
      <PostActionAuthenticationProvider>
        <PostReplyCoordinatorProvider owner="list" profile={null}>
          <PostMediaViewerHostProvider>
            <Story />
          </PostMediaViewerHostProvider>
        </PostReplyCoordinatorProvider>
      </PostActionAuthenticationProvider>
    ),
  ],
  excludeStories: [
    'ErrorRecoveryFocus',
    'OwnerMenuAndDirectActions',
    'PendingContract',
    'SheetIconContract',
    'VisitorMenuContract',
  ],
  parameters: {
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
  render: StoryRender,
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
  render: StoryRender,
  play: async ({ args, canvasElement }) => {
    args.onCopyLink.mockClear();
    args.onDelete.mockClear();
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
    expect(await body.findByRole('menuitem', { name: '삭제' })).toBeVisible();
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
  play: async ({ args, canvasElement }) => {
    args.onCopyLink.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
    expect(await body.findAllByRole('menuitem')).toHaveLength(1);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(body.queryByRole('menuitem', { name: '프로필에 고정' })).not.toBeInTheDocument();
    expect(body.queryByRole('menuitem', { name: '삭제' })).not.toBeInTheDocument();
    await userEvent.click(body.getByRole('menuitem', { name: '링크 복사' }));
    expect(args.onCopyLink).toHaveBeenCalledTimes(1);
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
