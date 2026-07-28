import { Suspense, useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { formatPostActionCount } from '@/components/post/postActionCount';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { spacing, typography } from '@/theme/tokens';
import PostActionBarStoryQueryNode from './__generated__/PostActionBarStoryQuery.graphql';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ViewStyle } from 'react-native';
import type { GraphQLResponse } from 'relay-runtime';
import type { PostActionBarProps } from '@/components/post/PostActionBar';
import type { PostActionBarStoryQuery } from './__generated__/PostActionBarStoryQuery.graphql';

const reply = fn();
const bookmark = fn();
const more = fn();
const reactionMutationRequest = fn();

const actionBarProps = {
  bookmark: {
    accessibilityLabel: '북마크',
    hasBookmarked: false,
    onPress: bookmark,
    processing: 'default' as const,
  },
  more: { accessibilityLabel: '더보기', onPress: more },
  reply: {
    accessibilityLabel: '답글',
    count: 12_345,
    expanded: false,
    onPress: reply,
    processing: 'default' as const,
  },
};

const sourcePostId = 'post-source';
const activeRepostId = 'post-repost-active';
type RepostFixtureState = 'hidden' | 'unselected' | 'selected' | 'pending';
type FixtureProps = Omit<PostActionBarProps, 'post'> & {
  onMutationRequest?: (requestName: string) => void;
  repostState?: RepostFixtureState;
  selectedProfileId?: string | null;
};

const postActionBarStoryQuery = graphql`
  query PostActionBarStoryQuery($id: ID!) {
    node(id: $id) {
      ... on Post {
        ...PostActionBar_post @alias(as: "actionBar")
      }
    }
  }
`;

const unselectedSource = {
  __typename: 'Post',
  id: sourcePostId,
  repostCount: 12_345,
  viewerRepost: null,
  viewerReactions: [],
};
const selectedSource = {
  ...unselectedSource,
  repostCount: 12_346,
  viewerRepost: { __typename: 'Post', id: activeRepostId },
  viewerReactions: [{ __typename: 'Reaction', id: 'reaction-story', type: '🥹' }],
};

function PostActionBarFixture({
  onMutationRequest,
  repostState = 'unselected',
  selectedProfileId = 'profile-story',
  ...props
}: FixtureProps) {
  const environment = useMemo(() => {
    const source =
      repostState === 'selected' || repostState === 'pending' ? selectedSource : unselectedSource;
    const result = new Environment({
      network: Network.create((request) => {
        if (request.operationKind === 'mutation') {
          onMutationRequest?.(request.name);
        }
        return request.operationKind !== 'mutation'
          ? Promise.resolve({
              data:
                request.name === 'SessionProviderQuery'
                  ? {
                      currentSession: {
                        __typename: 'Session',
                        id: 'session-story',
                        selectedProfile:
                          selectedProfileId === null
                            ? null
                            : {
                                __typename: 'Profile',
                                id: selectedProfileId,
                              },
                      },
                      me: { __typename: 'Account', id: 'account-story', name: 'Story' },
                    }
                  : { node: source },
            } as GraphQLResponse)
          : repostState === 'pending'
            ? Observable.create(() => undefined)
            : Promise.resolve({
                data:
                  request.name === 'RepostActionDeletePostMutation'
                    ? { deletePost: { postId: activeRepostId } }
                    : {
                        repostPost: {
                          repost: {
                            __typename: 'Post',
                            id: activeRepostId,
                            repostSource: selectedSource,
                          },
                        },
                      },
              });
      }),
      store: new Store(new RecordSource()),
    });
    result.commitPayload(
      createOperationDescriptor(getRequest(PostActionBarStoryQueryNode), { id: sourcePostId }),
      { node: source },
    );
    return result;
  }, [onMutationRequest, repostState, selectedProfileId]);
  const createEnvironment = useCallback(() => environment, [environment]);

  if (repostState === 'hidden') {
    return <PostActionBar {...props} />;
  }

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      <Suspense fallback={<View />}>
        <SessionProvider>
          <PostActionBarFixtureContents {...props} />
        </SessionProvider>
      </Suspense>
    </RelayActorProvider>
  );
}

function PostActionBarFixtureContents(props: Omit<PostActionBarProps, 'post'>) {
  const data = useLazyLoadQuery<PostActionBarStoryQuery>(
    postActionBarStoryQuery,
    { id: sourcePostId },
    { fetchPolicy: 'store-only' },
  );

  return <PostActionBar {...props} post={data.node!.actionBar!} />;
}

type BookmarkProcessingState = NonNullable<PostActionBarProps['bookmark']>['processing'];

// @ts-expect-error Public processing states must not retain an error state.
const rejectedErrorProcessingState: BookmarkProcessingState = 'error';
void rejectedErrorProcessingState;

function CatalogStory() {
  return (
    <Catalog>
      <Section title="Default · Reply/Repost count / no count / Reaction/Bookmark count omitted">
        <PostActionBarFixture {...actionBarProps} />
        <PostActionBarFixture
          bookmark={actionBarProps.bookmark}
          reply={{ ...actionBarProps.reply, count: undefined }}
          repostState="unselected"
        />
      </Section>
      <Section title="Domain active · Reply / Repost / Reaction / Bookmark">
        <PostActionBarFixture
          bookmark={{ ...actionBarProps.bookmark, hasBookmarked: true }}
          reply={{ ...actionBarProps.reply, expanded: true }}
          repostState="selected"
        />
      </Section>
      <Section title="Processing · pending / disabled">
        <PostActionBarFixture
          bookmark={{ ...actionBarProps.bookmark, hasBookmarked: true, processing: 'disabled' }}
          reply={{ ...actionBarProps.reply, expanded: true, processing: 'pending' }}
          repostState="pending"
        />
      </Section>
      <Section title="Optional actions · More callback only">
        <PostActionBarFixture more={actionBarProps.more} repostState="hidden" />
      </Section>
      <Section title="Standard compact formatting · runtime component / locale seam">
        <Text style={styles.localeCopy}>
          ko-KR: {formatPostActionCount(12_345, 'ko-KR')} · en-US:{' '}
          {formatPostActionCount(12_345, 'en-US')}
        </Text>
        <PostActionBarFixture {...actionBarProps} />
      </Section>
    </Catalog>
  );
}

function ControlledReplyStory() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.controlled}>
      <PostActionBarFixture
        reply={{
          ...actionBarProps.reply,
          expanded,
          onPress: () => setExpanded((value) => !value),
        }}
      />
      <Text>{expanded ? 'Composer expanded' : 'Composer collapsed'}</Text>
    </View>
  );
}

function InteractionStory() {
  return (
    <Catalog>
      <Section title="Default invokes callbacks">
        <PostActionBarFixture
          bookmark={actionBarProps.bookmark}
          more={actionBarProps.more}
          reply={actionBarProps.reply}
        />
      </Section>
      <Section title="Pending and disabled block callbacks">
        <PostActionBarFixture bookmark={{ ...actionBarProps.bookmark, processing: 'disabled' }} />
      </Section>
    </Catalog>
  );
}

function ActionBarFixtures() {
  return (
    <View style={styles.fixture}>
      <View style={styles.detailSurface}>
        <PostActionBarFixture {...actionBarProps} />
      </View>
      <View style={styles.listCard}>
        <View style={styles.avatarFixture} />
        <View style={styles.listContent}>
          <PostActionBarFixture {...actionBarProps} />
        </View>
      </View>
    </View>
  );
}

const meta = {
  component: CatalogStory,
  title: 'KOSMO/Post/Action Bar',
} satisfies Meta<typeof CatalogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActionBarCatalog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole('button');
    const reactionButtons = buttons.filter(
      (button) => button.getAttribute('aria-label') === '반응',
    );
    const bookmarkButtons = buttons.filter((button) =>
      button.getAttribute('aria-label')?.startsWith('북마크'),
    );
    const defaultToolbar = canvas.getAllByRole('toolbar')[0]!;
    const defaultToolbarCanvas = within(defaultToolbar);
    const iconMetrics = [
      ['답글', 16, 16, '3.5'],
      ['재게시', 16, 16, '2.7'],
      ['반응', 16, 16, '3.5'],
      ['북마크', 16, 16, '3.5'],
      ['더보기', 16, 16, '3.5'],
    ] as const;

    for (const [label, width, height, strokeWidth] of iconMetrics) {
      const icon = defaultToolbarCanvas.getByRole('button', { name: label }).querySelector('svg');
      expect(icon).toHaveAttribute('width', String(width));
      expect(icon).toHaveAttribute('height', String(height));
      expect(icon).toHaveAttribute('stroke-width', strokeWidth);
    }
    expect(
      defaultToolbarCanvas.getByTestId('post-action-repost-icon').getBoundingClientRect().width,
    ).toBe(16);

    for (const label of ['답글', '재게시'] as const) {
      const button = defaultToolbarCanvas.getByRole('button', { name: label });
      const iconBounds = button.querySelector('svg')!.getBoundingClientRect();
      const count = button.querySelector('[dir="auto"]') as HTMLElement;
      const countBounds = count.getBoundingClientRect();
      expect(count.scrollWidth).toBeLessThanOrEqual(count.clientWidth);
      expect(countBounds.top + countBounds.height / 2).toBeCloseTo(
        iconBounds.top + iconBounds.height / 2,
        0,
      );
      expect(countBounds.left - iconBounds.right).toBeCloseTo(spacing.xs, 0);
    }

    for (const button of bookmarkButtons) {
      expect(button).not.toHaveTextContent(/\S/);
    }

    expect(reactionButtons[0]?.querySelector('svg')).toHaveAttribute('fill', 'none');
    expect(bookmarkButtons[0]?.querySelector('svg')).toHaveAttribute('fill', 'none');
    expect(reactionButtons[2]?.querySelector('svg')).not.toHaveAttribute('fill', 'none');
    expect(bookmarkButtons[2]?.querySelector('svg')).not.toHaveAttribute('fill', 'none');
  },
};

export const ControlledReply: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '답글' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    await expect(canvas.findByText('Composer expanded')).resolves.toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  },
  render: () => <ControlledReplyStory />,
};

export const ReactionPopoverDismissFocusAndPlacement: Story = {
  globals: { viewport: { isRotated: false, value: 'reactionNarrow' } },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        reactionNarrow: {
          name: 'Reaction narrow',
          styles: { height: '640px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [topLeftTrigger, bottomRightTrigger] = canvas.getAllByRole('button', { name: '반응' });

    expect(topLeftTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(topLeftTrigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(topLeftTrigger!);
    await screen.findByRole('dialog', { name: '반응 선택' });
    let position = screen.getByTestId('reaction-popover-position');
    await waitFor(() => expect(position).toHaveAttribute('data-placement', 'bottom'));
    expect(canvasElement.ownerDocument.activeElement).toHaveAttribute('aria-label', '🥹 반응');
    expect(position.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);

    const shell = screen.getByTestId('reaction-popover-scroll');
    expect(shell.getBoundingClientRect().left).toBeGreaterThanOrEqual(spacing.sm);
    expect(shell.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth - spacing.sm,
    );
    expect(getComputedStyle(shell).overflowX).toBe('auto');
    for (const option of screen.getAllByRole('button', { name: /반응/ })) {
      const bounds = option.getBoundingClientRect();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }

    await userEvent.click(topLeftTrigger!);
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    await userEvent.click(topLeftTrigger!);
    await userEvent.click(screen.getByTestId('reaction-popover-backdrop'));
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    expect(canvasElement.ownerDocument.activeElement).toBe(topLeftTrigger);

    await userEvent.click(topLeftTrigger!);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    expect(canvasElement.ownerDocument.activeElement).toBe(topLeftTrigger);

    await userEvent.click(bottomRightTrigger!);
    await screen.findByRole('dialog', { name: '반응 선택' });
    position = screen.getByTestId('reaction-popover-position');
    await waitFor(() => expect(position).toHaveAttribute('data-placement', 'top'));
    expect(position.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth - spacing.sm,
    );
  },
  render: () => (
    <View style={styles.placementFixture}>
      <View style={styles.topLeftAction}>
        <PostActionBarFixture />
      </View>
      <View style={styles.bottomRightAction}>
        <PostActionBarFixture />
      </View>
    </View>
  ),
};

export const NoSelectedProfileDisablesReaction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    reactionMutationRequest.mockClear();
    const trigger = canvas.getByRole('button', { name: '반응' });

    expect(trigger).toBeDisabled();
    trigger.click();
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    expect(reactionMutationRequest).not.toHaveBeenCalled();
  },
  render: () => (
    <PostActionBarFixture onMutationRequest={reactionMutationRequest} selectedProfileId={null} />
  ),
};

export const InteractionContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    reply.mockClear();
    bookmark.mockClear();
    more.mockClear();

    const labels = canvas.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      '답글',
      '재게시',
      '반응',
      '북마크',
      '더보기',
      '재게시',
      '반응',
      '북마크',
    ]);

    const replyButton = canvas.getByRole('button', { name: '답글' });
    replyButton.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await userEvent.click(canvas.getAllByRole('button', { name: '재게시' })[0]!);
    await userEvent.click(canvas.getAllByRole('button', { name: '반응' })[0]!);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getAllByRole('button', { name: '북마크' })[0]!);
    await userEvent.click(canvas.getByRole('button', { name: '더보기' }));
    const disabledBookmark = canvas.getAllByRole('button', { name: '북마크' })[1]!;
    expect(disabledBookmark).toBeDisabled();
    expect(disabledBookmark).toHaveAttribute('tabindex', '-1');
    disabledBookmark.focus();
    expect(canvasElement.ownerDocument.activeElement).not.toBe(disabledBookmark);
    disabledBookmark.click();

    expect(reply).toHaveBeenCalledTimes(2);
    expect(bookmark).toHaveBeenCalledTimes(1);
    expect(more).toHaveBeenCalledTimes(1);
  },
  render: () => <InteractionStory />,
};

export const ProcessingAccessibility: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const replyButton = canvas.getByRole('button', { name: '답글' });
    const repostButton = canvas.getByRole('button', { name: '재게시 취소' });
    await userEvent.click(repostButton);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    );
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toHaveAttribute(
      'aria-busy',
      'true',
    );
    const reactionButton = canvas.getByRole('button', { name: '반응' });
    const bookmarkButton = canvas.getByRole('button', { name: '북마크' });
    const moreButton = canvas.getByRole('button', { name: '더보기' });

    expect(replyButton).toHaveAttribute('aria-expanded', 'true');
    expect(replyButton).toHaveAttribute('aria-busy', 'true');
    expect(replyButton).toHaveAttribute('aria-disabled', 'true');
    expect(repostButton).toHaveAttribute('aria-pressed', 'true');
    expect(repostButton).toHaveAttribute('aria-busy', 'true');
    expect(repostButton).toHaveAttribute('aria-disabled', 'true');
    expect(reactionButton).toHaveAttribute('aria-pressed', 'true');
    expect(reactionButton).not.toHaveAttribute('aria-disabled');
    expect(bookmarkButton).toHaveAttribute('aria-pressed', 'true');
    expect(bookmarkButton).not.toHaveAttribute('aria-busy');
    expect(bookmarkButton).not.toHaveAttribute('aria-disabled');
    expect(bookmarkButton).not.toHaveAttribute('aria-description');
    expect(moreButton).not.toHaveAttribute('aria-pressed');
    expect(moreButton).not.toHaveAttribute('aria-expanded');
    expect(moreButton).not.toHaveAttribute('aria-busy');
    expect(moreButton).not.toHaveAttribute('aria-disabled');
    expect(canvas.getByTestId('post-action-reply-spinner')).toBeVisible();
    expect(canvas.getByTestId('post-action-repost-spinner')).toBeVisible();
    expect(canvas.queryByTestId('post-action-bookmark-spinner')).toBeNull();
    const replySpinner = canvas.getByTestId('post-action-reply-spinner');
    const replySpinnerVisual = replySpinner.firstElementChild as HTMLElement;
    const replySpinnerBounds = replySpinnerVisual.getBoundingClientRect();
    const replyCountBounds = replyButton.querySelector('[dir="auto"]')!.getBoundingClientRect();
    const repostSpinner = canvas.getByTestId('post-action-repost-spinner');
    const repostSpinnerVisual = repostSpinner.firstElementChild as HTMLElement;
    const repostSpinnerBounds = repostSpinnerVisual.getBoundingClientRect();
    const repostCountBounds = repostButton.querySelector('[dir="auto"]')!.getBoundingClientRect();
    expect(replySpinnerVisual.clientWidth).toBe(14);
    expect(replySpinnerVisual.clientHeight).toBe(14);
    expect(replySpinnerBounds.top + replySpinnerBounds.height / 2).toBeCloseTo(
      replyCountBounds.top + replyCountBounds.height / 2,
      0,
    );
    expect(repostSpinnerBounds.top + repostSpinnerBounds.height / 2).toBeCloseTo(
      repostCountBounds.top + repostCountBounds.height / 2,
      0,
    );
    expect(
      canvas.getByTestId('post-action-bookmark-icon').querySelector('svg'),
    ).not.toHaveAttribute('fill', 'none');
  },
  render: () => (
    <PostActionBarFixture
      bookmark={{ ...actionBarProps.bookmark, hasBookmarked: true }}
      more={actionBarProps.more}
      reply={{ ...actionBarProps.reply, expanded: true, processing: 'pending' }}
      repostState="pending"
    />
  ),
};

export const AccessibilityAndCompactGeometry: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionBar = canvas.getByRole('toolbar');
    const buttons = within(actionBar).getAllByRole('button');

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '답글',
      '재게시',
      '반응',
      '북마크',
      '더보기',
    ]);
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-haspopup', 'menu');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false');
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[3]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[4]).not.toHaveAttribute('aria-pressed');
    expect(actionBar.getBoundingClientRect().height).toBe(28);
    for (const [index, button] of buttons.entries()) {
      const bounds = button.getBoundingClientRect();
      expect(bounds.width).toBe(index === 4 ? 28 : 50);
      expect(bounds.height).toBe(28);
      expect(bounds.width).toBeGreaterThanOrEqual(24);
      expect(bounds.height).toBeGreaterThanOrEqual(24);
    }
    const actionBarBounds = actionBar.getBoundingClientRect();
    const firstButtonBounds = buttons[0]!.getBoundingClientRect();
    const moreButtonBounds = buttons[4]!.getBoundingClientRect();
    expect(firstButtonBounds.left).toBeCloseTo(actionBarBounds.left + spacing.sm, 0);
    expect(moreButtonBounds.right).toBeCloseTo(actionBarBounds.right - spacing.sm, 0);
  },
  render: () => <PostActionBarFixture {...actionBarProps} />,
};

export const Compact390: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  play: verifyFixtures(358, 314),
  render: () => <ActionBarFixtures />,
};

export const Compact900: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: { layout: 'fullscreen' },
  play: verifyFixtures(568, 524),
  render: () => <ActionBarFixtures />,
};

export const Full1400: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { layout: 'fullscreen' },
  play: verifyFixtures(568, 524),
  render: () => <ActionBarFixtures />,
};

const styles = {
  bottomRightAction: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    width: 88,
  } satisfies ViewStyle,
  controlled: { gap: spacing.sm },
  avatarFixture: { height: 48, width: 48 },
  detailSurface: { paddingHorizontal: spacing.lg },
  fixture: {
    alignSelf: 'center',
    gap: spacing.lg,
    maxWidth: 600,
    width: '100%',
  } satisfies ViewStyle,
  listCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  } satisfies ViewStyle,
  listContent: { flex: 1, minWidth: 0 } satisfies ViewStyle,
  localeCopy: { fontFamily: 'SUIT', ...typography.sm },
  placementFixture: {
    height: 640,
    position: 'relative',
    width: '100%',
  } satisfies ViewStyle,
  topLeftAction: {
    left: -44,
    position: 'absolute',
    top: 0,
    width: 88,
  } satisfies ViewStyle,
};

function verifyFixtures(expectedDetailWidth: number, expectedListWidth: number) {
  return async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const toolbars = canvas.getAllByRole('toolbar', { name: '액션 바' });

    expect(toolbars).toHaveLength(2);
    verifySingleRow(toolbars[0]!, expectedDetailWidth);
    verifySingleRow(toolbars[1]!, expectedListWidth);
  };
}

function verifySingleRow(toolbar: HTMLElement, expectedContentWidth: number) {
  const toolbarBounds = toolbar.getBoundingClientRect();
  const buttons = within(toolbar).getAllByRole('button');
  const firstBounds = buttons[0]!.getBoundingClientRect();
  let previousRight = toolbarBounds.left;

  expect(toolbarBounds.width).toBeCloseTo(expectedContentWidth, 0);
  expect(toolbarBounds.height).toBe(28);
  for (const [index, button] of buttons.entries()) {
    const bounds = button.getBoundingClientRect();
    expect(bounds.width).toBe(index === 4 ? 28 : 50);
    expect(bounds.height).toBe(28);
    expect(bounds.width).toBeGreaterThanOrEqual(24);
    expect(bounds.height).toBeGreaterThanOrEqual(24);
    expect(bounds.top).toBe(firstBounds.top);
    expect(bounds.bottom).toBe(firstBounds.bottom);
    expect(bounds.top).toBeGreaterThanOrEqual(toolbarBounds.top);
    expect(bounds.bottom).toBeLessThanOrEqual(toolbarBounds.bottom);
    expect(bounds.left).toBeGreaterThanOrEqual(previousRight);
    expect(bounds.right).toBeLessThanOrEqual(toolbarBounds.right);
    previousRight = bounds.right;
  }
  expect(buttons[0]!.getBoundingClientRect().left).toBeCloseTo(toolbarBounds.left + spacing.sm, 0);
  expect(buttons[4]!.getBoundingClientRect().right).toBeCloseTo(
    toolbarBounds.right - spacing.sm,
    0,
  );
}
