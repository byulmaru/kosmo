import { useMemo } from 'react';
import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PostList } from '@/components/post/PostList';
import { ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { SessionProvider } from '@/session/SessionProvider';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfilePinOrderStoriesQuery } from './__generated__/ProfilePinOrderStoriesQuery.graphql';

const query = graphql`
  query ProfilePinOrderStoriesQuery {
    node(id: "profile-kosmo") {
      __typename
      ... on Profile @alias(as: "profile") {
        ...PostList_profile
        ...PostList_profile_pinned
      }
    }
  }
`;

const author = profile({
  viewerState: {
    blockedBy: false,
    follow: null,
    followRequest: null,
    isSelf: true,
    profileBlock: null,
    profileMute: null,
  },
});
const pins = ['A', 'B', 'C'].map((label) => ({
  ...post({
    id: `pin-${label}`,
    bodyText: `대표 게시글 ${label}`,
    isPinned: true,
    profile: author,
  }),
  viewerReactions: [],
}));
const profileData = (order: number[]) => ({
  ...author,
  pinnedPosts: order.map((index) => pins[index]),
  posts: {
    edges: [],
    pageInfo: {
      startCursor: null,
      endCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  },
});

function PinList() {
  const data = useLazyLoadQuery<ProfilePinOrderStoriesQuery>(query, {});
  return data.node?.profile ? <PostList profile={data.node.profile} /> : null;
}

function Fixture({ outcome = 'success' }: { outcome?: 'success' | 'error' | 'pending' }) {
  const operationResponses = useMemo(
    () => ({
      SessionProviderQuery: {
        data: {
          currentSession: {
            __typename: 'Session',
            id: 'session-story',
            selectedProfile: { __typename: 'Profile', id: author.id },
          },
          me: { __typename: 'Account', id: 'account-story', name: 'Story' },
        },
      },
      ProfilePinOrderMutation:
        outcome === 'error'
          ? { error: 'reorder failed' }
          : {
              data: {
                reorderProfilePost: { changed: true, profile: profileData([1, 0, 2]) },
              },
              delayMs: outcome === 'pending' ? 60_000 : 20,
            },
    }),
    [outcome],
  );
  return (
    <RelayStoryProvider
      actorBoundary
      operationResponses={operationResponses}
      queryData={{ node: profileData([0, 1, 2]) }}
    >
      <SessionProvider>
        <View style={{ maxWidth: 680 }}>
          <PinList />
        </View>
      </SessionProvider>
    </RelayStoryProvider>
  );
}

const meta = {
  title: 'KOSMO/Patterns/Profile/Pin Order',
  component: Fixture,
  args: { outcome: 'success' },
  parameters: { controls: { disable: true } },
} satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MenuMovementAndFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const rows = await canvas.findAllByTestId('post-list-standard-row');
    const trigger = within(rows[1]!).getByRole('button', { name: '더 보기' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const move = await body.findByRole('menuitem', { name: '위로 이동' });
    move.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      expect(
        canvas
          .getAllByTestId('post-list-standard-row')
          .map((row) => within(row).getByText(/대표 게시글/).textContent),
      ).toEqual(['대표 게시글 B', '대표 게시글 A', '대표 게시글 C']);
      expect(trigger).toHaveFocus();
    });
    expect(body.queryByRole('alertdialog')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(body.queryByRole('menuitem', { name: '위로 이동' })).not.toBeInTheDocument();
    expect(body.getByRole('menuitem', { name: '아래로 이동' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  },
};

export const SheetMovementAndFocus: Story = {
  ...MenuMovementAndFocus,
  decorators: [
    (Story) => (
      <ActionMenuPresentationProvider presentation="sheet">
        <Story />
      </ActionMenuPresentationProvider>
    ),
  ],
};

export const FailedMovementCanRetry: Story = {
  args: { outcome: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const rows = await canvas.findAllByTestId('post-list-standard-row');
    const trigger = within(rows[1]!).getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '위로 이동' }));
    expect(
      await body.findByText('고정 게시글 순서를 변경하지 못했어요. 다시 시도해 주세요.'),
    ).toBeVisible();
    expect(
      canvas
        .getAllByTestId('post-list-standard-row')
        .map((row) => within(row).getByText(/대표 게시글/).textContent),
    ).toEqual(['대표 게시글 A', '대표 게시글 B', '대표 게시글 C']);
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '위로 이동' })).toBeEnabled();
    await userEvent.keyboard('{Escape}');
  },
};

export const PendingDisablesEveryPin: Story = {
  args: { outcome: 'pending' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const rows = await canvas.findAllByTestId('post-list-standard-row');
    await userEvent.click(within(rows[1]!).getByRole('button', { name: '더 보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '위로 이동' }));
    await waitFor(() => {
      for (const row of rows) {
        expect(within(row).getByRole('button', { name: '더 보기' })).toHaveAttribute(
          'aria-disabled',
          'true',
        );
      }
    });
    expect(
      canvas
        .getAllByTestId('post-list-standard-row')
        .map((row) => within(row).getByText(/대표 게시글/).textContent),
    ).toEqual(['대표 게시글 A', '대표 게시글 B', '대표 게시글 C']);
  },
};
