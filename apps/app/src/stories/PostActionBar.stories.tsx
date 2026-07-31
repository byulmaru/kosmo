import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
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
import { expect, fn, screen, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { formatPostActionCount } from '@/components/post/postActionCount';
import { usePostReactionController } from '@/components/post/PostReactionController';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { spacing, typography } from '@/theme/tokens';
import PostActionBarStoryQueryNode from './__generated__/PostActionBarStoryQuery.graphql';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ViewStyle } from 'react-native';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { PostActionBarProps } from '@/components/post/PostActionBar';
import type { PostActionBarStoryQuery } from './__generated__/PostActionBarStoryQuery.graphql';

const reply = fn();
const bookmark = fn();
const more = fn();
const reactionMutationRequest = fn();
const reactionLifecycleConsoleErrors: unknown[][] = [];

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
  showReactionSummary?: boolean;
};

const postActionBarStoryQuery = graphql`
  query PostActionBarStoryQuery($id: ID!) {
    node(id: $id) {
      ... on Post {
        ...PostActionBar_post @alias(as: "actionBar")
        ...PostReactionController_post @alias(as: "reactionController")
      }
    }
  }
`;

const unselectedSource = {
  __typename: 'Post',
  id: sourcePostId,
  repostCount: 12_345,
  reactionCounts: [
    { count: 12, type: '❤️' },
    { count: 7, type: '🎉' },
  ],
  reactionProfiles: {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  },
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
  showReactionSummary = false,
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
          <PostActionBarFixtureContents {...props} showReactionSummary={showReactionSummary} />
        </SessionProvider>
      </Suspense>
    </RelayActorProvider>
  );
}

function PostActionBarFixtureContents({
  showReactionSummary = false,
  ...props
}: Omit<PostActionBarProps, 'post' | 'reactionController'> & { showReactionSummary?: boolean }) {
  const data = useLazyLoadQuery<PostActionBarStoryQuery>(
    postActionBarStoryQuery,
    { id: sourcePostId },
    { fetchPolicy: 'store-only' },
  );
  const controller = usePostReactionController(data.node!.reactionController!);

  return (
    <>
      {showReactionSummary ? <PostReactionSummary controller={controller} /> : null}
      <PostActionBar {...props} post={data.node!.actionBar!} reactionController={controller} />
    </>
  );
}

type ReactionRequestOutcome = 'data-errors-success' | 'network-error' | 'payload-error' | 'success';

type ReactionMutationSink = Readonly<{
  complete: () => void;
  error: (error: Error) => void;
  next: (response: GraphQLResponse) => void;
}>;

type CapturedReactionRequest = {
  actorId: number;
  id: number;
  name: string;
  settled: boolean;
  sink: ReactionMutationSink;
  type: string;
};

type ReactionRequestSummary = Readonly<{
  actorId: number;
  id: number;
  name: string;
  settled: boolean;
  type: string;
}>;

function ReactionContractHarness() {
  const requestsRef = useRef<CapturedReactionRequest[]>([]);
  const selectedTypesByActor = useRef(new Map<number, Set<string>>());
  const nextActorId = useRef(0);
  const nextRequestId = useRef(0);
  const [mounted, setMounted] = useState(true);
  const [requests, setRequests] = useState<ReactionRequestSummary[]>([]);

  const createEnvironment = useCallback(() => {
    const actorId = ++nextActorId.current;
    selectedTypesByActor.current.set(actorId, new Set());
    const environment = new Environment({
      network: Network.create((request: RequestParameters, variables: Variables) => {
        if (request.operationKind !== 'mutation') {
          const selectedTypes = selectedTypesByActor.current.get(actorId)!;
          const reactionCounts = unselectedSource.reactionCounts.map((entry) => ({
            ...entry,
            count: entry.count + (selectedTypes.has(entry.type) ? 1 : 0),
          }));
          return Promise.resolve({
            data:
              request.name === 'SessionProviderQuery'
                ? {
                    currentSession: {
                      __typename: 'Session',
                      id: `session-${actorId}`,
                      selectedProfile: {
                        __typename: 'Profile',
                        id: `profile-${actorId}`,
                      },
                    },
                    me: {
                      __typename: 'Account',
                      id: `account-${actorId}`,
                      name: `Actor ${actorId}`,
                    },
                  }
                : { node: { ...unselectedSource, reactionCounts } },
          } as GraphQLResponse);
        }

        return Observable.create<GraphQLResponse>((sink) => {
          const captured: CapturedReactionRequest = {
            actorId,
            id: ++nextRequestId.current,
            name: request.name,
            settled: false,
            sink,
            type: String(variables.type),
          };
          requestsRef.current.push(captured);
          setRequests((current) => [
            ...current,
            {
              actorId: captured.actorId,
              id: captured.id,
              name: captured.name,
              settled: false,
              type: captured.type,
            },
          ]);
        });
      }),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(
      createOperationDescriptor(getRequest(PostActionBarStoryQueryNode), { id: sourcePostId }),
      { node: unselectedSource },
    );
    return environment;
  }, []);

  const settleRequest = useCallback((id: number, outcome: ReactionRequestOutcome) => {
    const request = requestsRef.current.find((candidate) => candidate.id === id);
    if (!request || request.settled) {
      return;
    }
    request.settled = true;
    setRequests((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, settled: true } : candidate,
      ),
    );

    if (outcome === 'network-error') {
      request.sink.error(new Error(`request ${id} failed`));
      return;
    }
    if (outcome === 'payload-error') {
      request.sink.next({
        data:
          request.name === 'PostReactionControllerAddReactionMutation'
            ? { addReaction: null }
            : { deleteReaction: null },
        errors: [{ message: `request ${id} payload missing` }],
      });
      request.sink.complete();
      return;
    }

    const selectedTypes = selectedTypesByActor.current.get(request.actorId)!;
    const add = request.name === 'PostReactionControllerAddReactionMutation';
    if (add) {
      selectedTypes.add(request.type);
    } else {
      selectedTypes.delete(request.type);
    }
    const post = {
      __typename: 'Post',
      id: sourcePostId,
      reactionCounts: unselectedSource.reactionCounts.map((entry) => ({
        ...entry,
        count: entry.count + (selectedTypes.has(entry.type) ? 1 : 0),
      })),
      viewerReactions: [...selectedTypes].map((type, index) => ({
        __typename: 'Reaction',
        id: `reaction-${request.actorId}-${index}-${type}`,
        type,
      })),
    };
    const data = add
      ? {
          addReaction: {
            post,
            reaction: {
              __typename: 'Reaction',
              id: `reaction-${request.actorId}-${request.id}`,
              type: request.type,
            },
          },
        }
      : {
          deleteReaction: {
            post,
            reactionId: null,
          },
        };
    request.sink.next({
      data,
      ...(outcome === 'data-errors-success'
        ? { errors: [{ message: `request ${id} partial error` }] }
        : {}),
    });
    request.sink.complete();
  }, []);

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      <ReactionContractControls
        mounted={mounted}
        onMountedChange={setMounted}
        onSettleRequest={settleRequest}
        requests={requests}
      />
    </RelayActorProvider>
  );
}

function ReactionContractControls({
  mounted,
  onMountedChange,
  onSettleRequest,
  requests,
}: {
  mounted: boolean;
  onMountedChange: (mounted: boolean) => void;
  onSettleRequest: (id: number, outcome: ReactionRequestOutcome) => void;
  requests: ReadonlyArray<ReactionRequestSummary>;
}) {
  const { resetActor, revision } = useRelayActor();

  return (
    <View>
      <Text
        accessibilityLabel="Reaction actor 전환"
        accessibilityRole="button"
        onPress={() => resetActor(`profile-${revision + 2}`)}
      >
        Reaction actor 전환
      </Text>
      <Text
        accessibilityLabel={mounted ? 'Reaction surface unmount' : 'Reaction surface remount'}
        accessibilityRole="button"
        onPress={() => onMountedChange(!mounted)}
      >
        {mounted ? 'Reaction surface unmount' : 'Reaction surface remount'}
      </Text>
      <Text testID="reaction-actor-revision">{revision}</Text>
      <Text testID="reaction-request-log">{JSON.stringify(requests)}</Text>
      {requests.map((request) => (
        <View key={request.id}>
          {(['success', 'payload-error', 'data-errors-success', 'network-error'] as const).map(
            (outcome) => (
              <Text
                accessibilityLabel={`요청 ${request.id} ${outcome}`}
                accessibilityRole="button"
                key={outcome}
                onPress={() => onSettleRequest(request.id, outcome)}
              >
                요청 {request.id} {outcome}
              </Text>
            ),
          )}
        </View>
      ))}
      {mounted ? (
        <Suspense fallback={<View />}>
          <SessionProvider>
            <PostActionBarFixtureContents showReactionSummary />
          </SessionProvider>
        </Suspense>
      ) : null}
    </View>
  );
}

function readReactionRequests(canvas: ReturnType<typeof within>): ReactionRequestSummary[] {
  return JSON.parse(
    canvas.getByTestId('reaction-request-log').textContent ?? '[]',
  ) as ReactionRequestSummary[];
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
    const dialog = await screen.findByRole('dialog', { name: '반응 선택' });
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
    for (const option of within(dialog).getAllByRole('button', { name: /반응/ })) {
      const bounds = option.getBoundingClientRect();
      expect(bounds.width).toBe(32);
      expect(bounds.height).toBe(32);
    }

    await userEvent.click(screen.getByTestId('reaction-popover-trigger-dismiss'));
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    expect(canvasElement.ownerDocument.activeElement).toBe(topLeftTrigger);
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
    const heartSummary = canvas.getByRole('button', { name: '❤️ 반응 12개' });
    const moreProfiles = canvas.getByRole('button', { name: '반응한 프로필 보기' });

    expect(trigger).toBeDisabled();
    expect(heartSummary).toBeDisabled();
    expect(moreProfiles).toBeEnabled();
    trigger.click();
    heartSummary.click();
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();
    expect(reactionMutationRequest).not.toHaveBeenCalled();

    await userEvent.click(moreProfiles);
    const dialog = await screen.findByRole('dialog', { name: '반응한 프로필' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(screen.findByText('아직 이 반응을 남긴 프로필이 없어요')).resolves.toBeVisible();
  },
  render: () => (
    <PostActionBarFixture
      onMutationRequest={reactionMutationRequest}
      selectedProfileId={null}
      showReactionSummary
    />
  ),
};

export const ReactionSummaryToggleContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heart = canvas.getByRole('button', { name: '❤️ 반응 12개' });

    await userEvent.click(heart);
    expect(screen.queryByRole('dialog', { name: '반응한 프로필' })).toBeNull();
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(1));
    expect(canvas.getByRole('button', { name: '❤️ 반응 12개, 처리 중' })).toBeDisabled();
    canvas.getByRole('button', { name: '요청 1 success' }).click();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '❤️ 반응 13개' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );

    await userEvent.click(canvas.getByRole('button', { name: '❤️ 반응 13개' }));
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(2));
    expect(canvas.getByRole('button', { name: '❤️ 반응 13개, 처리 중' })).toBeDisabled();
    canvas.getByRole('button', { name: '요청 2 success' }).click();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '❤️ 반응 12개' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  },
  render: () => <ReactionContractHarness />,
};

export const ReactionConcurrentMutationContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '반응' }));
    const heart = await screen.findByRole('button', { name: '❤️ 반응' });
    const party = screen.getByRole('button', { name: '🎉 반응' });

    unstable_batchedUpdates(() => {
      heart.click();
      heart.click();
      party.click();
    });
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(2));
    let requests = readReactionRequests(canvas);
    expect(requests.filter((request) => request.type === '❤️')).toHaveLength(1);
    expect(requests.filter((request) => request.type === '🎉')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '❤️ 반응, 처리 중' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '🎉 반응, 처리 중' })).toBeDisabled();

    const partyRequest = requests.find((request) => request.type === '🎉')!;
    canvas.getByRole('button', { name: `요청 ${partyRequest.id} success` }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '🎉 반응' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByRole('button', { name: '❤️ 반응, 처리 중' })).toBeDisabled();

    const heartRequest = requests.find((request) => request.type === '❤️')!;
    canvas.getByRole('button', { name: `요청 ${heartRequest.id} success` }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '❤️ 반응' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByRole('dialog', { name: '반응 선택' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '❤️ 반응' }));
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(3));
    requests = readReactionRequests(canvas);
    const deleteHeart = requests.find(
      (request) => request.name === 'PostReactionControllerDeleteReactionMutation',
    )!;
    canvas.getByRole('button', { name: `요청 ${deleteHeart.id} success` }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '❤️ 반응' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(screen.getByRole('button', { name: '🎉 반응' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('dialog', { name: '반응 선택' })).toBeVisible();
  },
  render: () => <ReactionContractHarness />,
};

export const ReactionFailureRetryActorSwitchAndUnmount: Story = {
  beforeEach: () => {
    reactionLifecycleConsoleErrors.length = 0;
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      reactionLifecycleConsoleErrors.push(args);
      const expectedGraphQLError = args.some(
        (argument) =>
          typeof argument === 'string' &&
          (argument.includes('payload missing') || argument.includes('partial error')),
      );
      if (!expectedGraphQLError) {
        originalError(...args);
      }
    });
    return () => errorSpy.mockRestore();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '반응' }));
    await userEvent.click(await screen.findByRole('button', { name: '❤️ 반응' }));
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(1));
    canvas.getByRole('button', { name: '요청 1 payload-error' }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '❤️ 반응, 오류, 다시 시도' })).toBeVisible(),
    );
    expect(canvas.getByRole('button', { name: '❤️ 반응 12개, 오류, 다시 시도' })).toBeVisible();
    expect(screen.getByRole('button', { name: '🎉 반응' })).not.toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '❤️ 반응, 오류, 다시 시도' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '❤️ 반응, 처리 중' })).toBeDisabled(),
    );
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(2));
    canvas.getByRole('button', { name: '요청 2 data-errors-success' }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '❤️ 반응' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.queryByRole('button', { name: /오류, 다시 시도/ })).toBeNull();

    unstable_batchedUpdates(() => {
      screen.getByRole('button', { name: '🎉 반응' }).click();
      screen.getByRole('button', { name: '☘️ 반응' }).click();
    });
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(4));
    const oldActorRequests = readReactionRequests(canvas).slice(2, 4);
    canvas.getByRole('button', { name: 'Reaction actor 전환' }).click();
    await waitFor(() =>
      expect(canvas.getByTestId('reaction-actor-revision')).toHaveTextContent('1'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull());

    await userEvent.click(await canvas.findByRole('button', { name: '반응' }));
    await userEvent.click(await screen.findByRole('button', { name: '👀 반응' }));
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(5));
    const currentActorRequest = readReactionRequests(canvas)[4]!;
    canvas.getByRole('button', { name: `요청 ${oldActorRequests[0]!.id} success` }).click();
    canvas.getByRole('button', { name: `요청 ${oldActorRequests[1]!.id} network-error` }).click();
    expect(screen.getByRole('button', { name: '👀 반응, 처리 중' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /오류, 다시 시도/ })).toBeNull();

    canvas.getByRole('button', { name: `요청 ${currentActorRequest.id} success` }).click();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '👀 반응' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    unstable_batchedUpdates(() => {
      screen.getByRole('button', { name: '🌈 반응' }).click();
      screen.getByRole('button', { name: '🥹 반응' }).click();
    });
    await waitFor(() => expect(readReactionRequests(canvas)).toHaveLength(7));
    const unmountedRequests = readReactionRequests(canvas).slice(5, 7);
    canvas.getByRole('button', { name: 'Reaction surface unmount' }).click();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull());
    canvas.getByRole('button', { name: `요청 ${unmountedRequests[0]!.id} success` }).click();
    canvas.getByRole('button', { name: `요청 ${unmountedRequests[1]!.id} network-error` }).click();
    expect(screen.queryByRole('dialog', { name: '반응 선택' })).toBeNull();

    canvas.getByRole('button', { name: 'Reaction surface remount' }).click();
    await userEvent.click(await canvas.findByRole('button', { name: '반응' }));
    await screen.findByRole('dialog', { name: '반응 선택' });
    expect(screen.queryByRole('button', { name: /처리 중|오류, 다시 시도/ })).toBeNull();
    expect(
      reactionLifecycleConsoleErrors
        .flat()
        .map((value) => String(value))
        .join(' '),
    ).not.toMatch(/state update|unmount/i);
  },
  render: () => <ReactionContractHarness />,
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
