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
import { expect, fireEvent, fn, screen, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { formatPostActionCount } from '@/components/post/postActionCount';
import { usePostMoreMenuItem } from '@/components/post/PostMoreMenu';
import { usePostReactionController } from '@/components/post/PostReactionController';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { colors, spacing, typography } from '@/theme/tokens';
import { Catalog, Section } from '../StoryFrame';
import PostActionBarStoryQueryNode from './__generated__/PostActionBarStoryQuery.graphql';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ViewStyle } from 'react-native';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { PostActionBarProps } from '@/components/post/PostActionBar';
import type { PostActionProcessingState } from '@/components/post/PostActionControl';
import type { PostActionBarStoryQuery } from './__generated__/PostActionBarStoryQuery.graphql';

const reply = fn();
const bookmark = fn();
const more = fn();
const deletionMutationRequest = fn();
const reactionMutationRequest = fn();
const playgroundBookmark = fn();
const playgroundReply = fn();
const reactionLifecycleConsoleErrors: unknown[][] = [];
const reactionActionColor = '#F97066';
const repostActionColors = { dark: '#409667', light: '#16794A' } as const;

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
type RepostFixtureState = 'unselected' | 'selected' | 'pending';
type RepostPlaygroundState = Exclude<RepostFixtureState, 'pending'>;
type DeleteOutcome = 'graphql-error' | 'network-error' | 'pending' | 'success';
type FixtureProps = Omit<PostActionBarProps, 'post'> & {
  deleteOutcome?: DeleteOutcome;
  onMutationRequest?: (requestName: string) => void;
  reactionSelected?: boolean;
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
  content: { __typename: 'PostContent', id: 'content-source' },
  id: sourcePostId,
  profile: { __typename: 'Profile', id: 'profile-author' },
  state: 'ACTIVE',
  repostCount: 12_345,
  reactionCounts: [
    { count: 12, type: '❤️' },
    { count: 7, type: '🎉' },
  ],
  reactionProfiles: {
    edges: [],
    pageInfo: { endCursor: null, hasNextPage: false },
  },
  viewerBookmark: null,
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
  deleteOutcome = 'success',
  onMutationRequest,
  reactionSelected = false,
  repostState = 'unselected',
  selectedProfileId = 'profile-story',
  showReactionSummary = false,
  ...props
}: FixtureProps) {
  const environment = useMemo(() => {
    const source = {
      ...(repostState === 'selected' || repostState === 'pending'
        ? selectedSource
        : unselectedSource),
      viewerReactions: reactionSelected
        ? selectedSource.viewerReactions
        : unselectedSource.viewerReactions,
    };
    const result = new Environment({
      network: Network.create((request) => {
        if (request.operationKind === 'mutation') {
          onMutationRequest?.(request.name);
          if (request.name === 'PostDeletionActionDeletePostMutation') {
            if (deleteOutcome === 'pending') {
              return Observable.create(() => undefined);
            }
            if (deleteOutcome === 'network-error') {
              return Promise.reject(new Error('delete failed'));
            }
            if (deleteOutcome === 'graphql-error') {
              return Promise.resolve({
                data: { deletePost: null },
                errors: [{ message: 'delete failed' }],
              } as GraphQLResponse);
            }
          }
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
                  request.name === 'PostDeletionActionDeletePostMutation'
                    ? { deletePost: { postId: sourcePostId } }
                    : request.name === 'RepostActionDeletePostMutation'
                      ? {
                          deletePost: {
                            postId: activeRepostId,
                            repostSource: {
                              __typename: 'Post',
                              id: sourcePostId,
                              repostCount: unselectedSource.repostCount,
                              viewerRepost: null,
                            },
                          },
                        }
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
  }, [deleteOutcome, onMutationRequest, reactionSelected, repostState, selectedProfileId]);
  const createEnvironment = useCallback(() => environment, [environment]);

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
  const [deleted, setDeleted] = useState(false);
  const data = useLazyLoadQuery<PostActionBarStoryQuery>(
    postActionBarStoryQuery,
    { id: sourcePostId },
    { fetchPolicy: 'store-only' },
  );
  if (deleted || !data.node) {
    return <Text>삭제된 게시글</Text>;
  }

  return (
    <PostActionBarFixtureLoaded
      data={data.node}
      onDeleted={() => {
        setDeleted(true);
        props.onDeleted?.();
      }}
      props={props}
      showReactionSummary={showReactionSummary}
    />
  );
}

function PostActionBarFixtureLoaded({
  data,
  onDeleted,
  props,
  showReactionSummary,
}: {
  data: NonNullable<PostActionBarStoryQuery['response']['node']>;
  onDeleted: () => void;
  props: Omit<PostActionBarProps, 'post' | 'reactionController'>;
  showReactionSummary: boolean;
}) {
  const controller = usePostReactionController(data.reactionController!);
  return (
    <>
      {showReactionSummary ? <PostReactionSummary controller={controller} /> : null}
      <PostActionBar
        {...props}
        onDeleted={onDeleted}
        post={data.actionBar!}
        reactionController={controller}
      />
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
          reactionSelected
          reply={{ ...actionBarProps.reply, expanded: true }}
          repostState="selected"
        />
      </Section>
      <Section title="Processing · config pending / disabled">
        <PostActionBarFixture
          bookmark={{ ...actionBarProps.bookmark, hasBookmarked: true, processing: 'disabled' }}
          reply={{ ...actionBarProps.reply, expanded: true, processing: 'pending' }}
        />
      </Section>
      <Section title="Resolution-required · hover blocked">
        <PostActionBarFixture
          bookmark={actionBarProps.bookmark}
          execution={{ kind: 'resolution-required', reason: 'profile' }}
          reply={actionBarProps.reply}
          repostExecution={{ kind: 'resolution-required', reason: 'profile' }}
        />
      </Section>
      <Section title="Optional actions · More callback only">
        <PostActionBar more={actionBarProps.more} />
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

type PlaygroundProps = {
  bookmarkAccessibilityLabel: string;
  bookmarkProcessing: PostActionProcessingState;
  bookmarkSelected: boolean;
  onBookmark: () => void;
  onReply: () => void;
  replyAccessibilityLabel: string;
  replyCount: number;
  replyExpanded: boolean;
  replyProcessing: PostActionProcessingState;
  reactionSelected: boolean;
  repostState: RepostPlaygroundState;
};

function PostActionBarPlayground({
  bookmarkAccessibilityLabel,
  bookmarkProcessing,
  bookmarkSelected,
  onBookmark,
  onReply,
  replyAccessibilityLabel,
  replyCount,
  replyExpanded,
  replyProcessing,
  reactionSelected,
  repostState,
}: PlaygroundProps) {
  const copyLinkItem = usePostMoreMenuItem({
    postId: sourcePostId,
    relativeHandle: '@kosmo',
  });

  return (
    <View style={styles.playground}>
      <PostActionBarFixture
        bookmark={{
          accessibilityLabel: bookmarkAccessibilityLabel,
          hasBookmarked: bookmarkSelected,
          onPress: onBookmark,
          processing: bookmarkProcessing,
        }}
        moreItems={[copyLinkItem]}
        reply={{
          accessibilityLabel: replyAccessibilityLabel,
          count: replyCount,
          expanded: replyExpanded,
          onPress: onReply,
          processing: replyProcessing,
        }}
        reactionSelected={reactionSelected}
        repostState={repostState}
      />
    </View>
  );
}

const meta = {
  args: {
    bookmarkAccessibilityLabel: '북마크',
    bookmarkProcessing: 'default',
    bookmarkSelected: false,
    onBookmark: playgroundBookmark,
    onReply: playgroundReply,
    replyCount: 12_345,
    replyAccessibilityLabel: '답글',
    replyExpanded: false,
    replyProcessing: 'default',
    reactionSelected: false,
    repostState: 'unselected',
  },
  argTypes: {
    bookmarkProcessing: { control: 'select', options: ['default', 'pending', 'disabled'] },
    replyCount: { control: { min: 0, step: 1, type: 'number' } },
    replyProcessing: { control: 'select', options: ['default', 'pending', 'disabled'] },
    repostState: { control: 'select', options: ['unselected', 'selected'] },
  },
  component: PostActionBarPlayground,
  excludeStories: [
    'ActionBarCatalogInteraction',
    'ActionSemanticColorsDarkInteraction',
    'AuthorPostDeletion',
    'AuthorPostDeletionFailureRetry',
    'AuthorPostDeletionGraphQLErrorRetry',
    'AuthorPostDeletionPending',
    'ControlledReply',
    'InteractionContract',
    'NoSelectedProfileDisablesReaction',
    'PlaygroundInteraction',
    'ProcessingAccessibility',
    'ReactionConcurrentMutationContract',
    'ReactionFailureRetryActorSwitchAndUnmount',
    'ReactionPopoverDismissFocusAndPlacement',
    'ReactionSummaryToggleContract',
  ],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Post/Action Bar',
} satisfies Meta<typeof PostActionBarPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'bookmarkAccessibilityLabel',
        'bookmarkProcessing',
        'bookmarkSelected',
        'replyCount',
        'replyAccessibilityLabel',
        'replyExpanded',
        'replyProcessing',
        'reactionSelected',
        'repostState',
      ],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const toolbar = await canvas.findByRole('toolbar', { name: '액션 바' });
    const labels = within(toolbar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      args.replyAccessibilityLabel,
      args.repostState === 'selected' ? '재게시 취소' : '재게시',
      '반응',
      args.bookmarkAccessibilityLabel,
      '더 보기',
    ]);
    const bookmarkBounds = canvas
      .getByRole('button', { name: args.bookmarkAccessibilityLabel })
      .parentElement!.getBoundingClientRect();
    const moreBounds = canvas
      .getByRole('button', { name: '더 보기' })
      .parentElement!.getBoundingClientRect();
    expect(moreBounds.left - bookmarkBounds.right).toBe(4);
    expect(moreBounds.right - bookmarkBounds.left).toBe(82);
  },
};

export const PlaygroundInteraction: Story = {
  args: { reactionSelected: false, repostState: 'selected' },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    playgroundBookmark.mockClear();
    playgroundReply.mockClear();
    const canvas = within(canvasElement);
    const toolbar = await canvas.findByRole('toolbar', { name: '액션 바' });
    const labels = within(toolbar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    await step('Controls에 따른 고정 순서와 trailing group 확인', async () => {
      expect(labels).toEqual([
        args.replyAccessibilityLabel,
        args.repostState === 'selected' ? '재게시 취소' : '재게시',
        '반응',
        args.bookmarkAccessibilityLabel,
        '더 보기',
      ]);
      expect(canvas.getByRole('button', { name: '반응' })).toHaveAttribute(
        'aria-pressed',
        String(args.reactionSelected),
      );
      const bookmarkBounds = canvas
        .getByRole('button', { name: args.bookmarkAccessibilityLabel })
        .parentElement!.getBoundingClientRect();
      const moreBounds = canvas
        .getByRole('button', { name: '더 보기' })
        .parentElement!.getBoundingClientRect();
      expect(moreBounds.left - bookmarkBounds.right).toBe(4);
      expect(moreBounds.right - bookmarkBounds.left).toBe(82);
    });

    await step('Actions callback과 처리 상태 확인', async () => {
      const replyButton = canvas.getByRole('button', { name: args.replyAccessibilityLabel });
      const bookmarkButton = canvas.getByRole('button', {
        name: args.bookmarkAccessibilityLabel,
      });

      if (args.replyProcessing === 'default') {
        await userEvent.click(replyButton);
        expect(playgroundReply).toHaveBeenCalledOnce();
      } else {
        replyButton.click();
        expect(playgroundReply).not.toHaveBeenCalled();
      }
      if (args.bookmarkProcessing === 'default') {
        await userEvent.click(bookmarkButton);
        expect(playgroundBookmark).toHaveBeenCalledOnce();
      } else {
        bookmarkButton.click();
        expect(playgroundBookmark).not.toHaveBeenCalled();
      }
      const moreButton = canvas.getByRole('button', { name: '더 보기' });
      expect(moreButton).toHaveAttribute('aria-haspopup', 'menu');
      await userEvent.click(moreButton);
      const menu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.getAttribute('aria-label')),
      ).toEqual(['링크 복사']);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu', { name: '더 보기 메뉴' })).not.toBeInTheDocument();
      expect(moreButton).toHaveFocus();
    });

    await step('Repost menu open·dismiss와 focus 복귀 확인', async () => {
      const repost = canvas.getByRole('button', {
        name: args.repostState === 'selected' ? '재게시 취소' : '재게시',
      });
      await userEvent.click(repost);
      expect(await screen.findByRole('menu', { name: '재게시 메뉴' })).toBeVisible();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu', { name: '재게시 메뉴' })).not.toBeInTheDocument();
      expect(repost).toHaveFocus();
    });
  },
};

export const ActionBarCatalog: Story = {
  render: () => <CatalogStory />,
};

export const ActionBarCatalogInteraction: Story = {
  render: () => <CatalogStory />,
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
    expect(reactionButtons[2]?.querySelector('svg')).toHaveAttribute('fill', 'none');
    expect(bookmarkButtons[2]?.querySelector('svg')).not.toHaveAttribute('fill', 'none');

    const toolbars = canvas.getAllByRole('toolbar', { name: '액션 바' });
    const defaultReply = defaultToolbarCanvas.getByRole('button', { name: '답글' });
    const defaultBookmark = defaultToolbarCanvas.getByRole('button', { name: '북마크' });
    const defaultMore = defaultToolbarCanvas.getByRole('button', { name: '더보기' });
    verifyHuggedActionTargets(defaultToolbar);
    const noCountReply = within(toolbars[1]!).getByRole('button', { name: '답글' });
    const noCountReplyBounds = noCountReply.getBoundingClientRect();
    const noCountReplySlotBounds = noCountReply.parentElement!.getBoundingClientRect();
    expect(noCountReplyBounds.width).toBe(28);
    expect(noCountReplyBounds.height).toBe(36);
    expect(noCountReplyBounds.left).toBeCloseTo(noCountReplySlotBounds.left, 0);
    expect(
      within(noCountReply).getByTestId('post-action-reply-glyph').getBoundingClientRect().left -
        noCountReplyBounds.left,
    ).toBeCloseTo(6, 0);
    const defaultBookmarkSlotBounds = defaultBookmark.parentElement!.getBoundingClientRect();
    const defaultMoreSlotBounds = defaultMore.parentElement!.getBoundingClientRect();
    expect(defaultMoreSlotBounds.left - defaultBookmarkSlotBounds.right).toBe(4);
    expect(defaultMoreSlotBounds.right - defaultBookmarkSlotBounds.left).toBe(82);
    expect(defaultToolbar.getBoundingClientRect().height).toBe(28);
    expect(canvas.queryByTestId('post-action-reply-hover')).toBeNull();

    await userEvent.hover(defaultReply);
    expect(defaultReply).not.toHaveStyle({ backgroundColor: colors.light.primary });
    const replyHover = within(defaultReply).getByTestId('post-action-reply-hover');
    expect(replyHover).toHaveStyle({ backgroundColor: colors.light.primary });
    expect(getComputedStyle(replyHover).opacity).toBe('0.3');
    expect(getComputedStyle(replyHover).borderRadius).toBe('999px');
    expect(getComputedStyle(replyHover).height).toBe('28px');
    expect(getComputedStyle(replyHover).width).toBe('28px');
    expect(getComputedStyle(replyHover).pointerEvents).toBe('none');
    expect(getComputedStyle(replyHover).zIndex).toBe('0');
    const replyGlyph = within(defaultReply).getByTestId('post-action-reply-glyph');
    expect(getComputedStyle(replyGlyph).zIndex).toBe('1');
    const replyHoverBounds = replyHover.getBoundingClientRect();
    const replyIconBounds = defaultReply.querySelector('svg')!.getBoundingClientRect();
    expect(defaultReply.querySelector('svg')).toHaveAttribute('stroke', colors.light.primary);
    expect(replyHoverBounds.width).toBe(28);
    expect(replyHoverBounds.height).toBe(28);
    expect(replyHoverBounds.left + replyHoverBounds.width / 2).toBeCloseTo(
      replyIconBounds.left + replyIconBounds.width / 2,
      0,
    );
    expect(replyHoverBounds.top + replyHoverBounds.height / 2).toBeCloseTo(
      replyIconBounds.top + replyIconBounds.height / 2,
      0,
    );
    const replyCount = defaultReply.querySelector('[dir="auto"]') as HTMLElement;
    expect(replyCount).toHaveStyle({ color: colors.light.primary });
    const replyCountBounds = replyCount.getBoundingClientRect();
    expect(replyCountBounds.left - replyIconBounds.right).toBeCloseTo(spacing.xs, 0);
    expect(defaultReply.getBoundingClientRect().width).toBeCloseTo(
      6 + replyIconBounds.width + spacing.xs + replyCountBounds.width + 6,
      0,
    );
    expect(defaultReply.getBoundingClientRect().height).toBe(36);

    const pointerUser = userEvent.setup();
    await pointerUser.pointer({ target: defaultReply, keys: '[MouseLeft>]' });
    await waitFor(() => expect(getComputedStyle(defaultReply).opacity).toBe('0.72'));
    expect(defaultReply).not.toHaveStyle({ backgroundColor: colors.light.primary });
    expect(within(defaultReply).getByTestId('post-action-reply-hover')).toBeVisible();
    await pointerUser.pointer({ target: defaultReply, keys: '[/MouseLeft]' });
    await userEvent.unhover(defaultReply);
    expect(getComputedStyle(defaultReply).opacity).toBe('1');
    expect(defaultReply.querySelector('svg')).toHaveAttribute('stroke', colors.light.textSecondary);
    expect(within(defaultReply).queryByTestId('post-action-reply-hover')).toBeNull();

    fireEvent.focus(defaultReply);
    fireEvent.keyDown(defaultReply, { code: 'Space', key: ' ' });
    await waitFor(() => expect(getComputedStyle(defaultReply).opacity).toBe('0.72'));
    expect(within(defaultReply).getByTestId('post-action-reply-hover')).toBeVisible();
    expect(defaultReply.querySelector('svg')).toHaveAttribute('stroke', colors.light.primary);
    expect(replyCount).toHaveStyle({ color: colors.light.primary });
    fireEvent.keyUp(defaultReply, { code: 'Space', key: ' ' });
    await waitFor(() => expect(getComputedStyle(defaultReply).opacity).toBe('1'));

    const resolutionReply = within(toolbars[4]!).getByRole('button', { name: '답글' });
    expect(within(resolutionReply).queryByTestId('post-action-reply-hover')).toBeNull();
    fireEvent.mouseDown(resolutionReply, { buttons: 1 });
    await waitFor(() => expect(getComputedStyle(resolutionReply).opacity).toBe('0.72'));
    expect(within(resolutionReply).getByTestId('post-action-reply-hover')).toBeVisible();
    fireEvent.mouseUp(resolutionReply, { buttons: 0 });
    await waitFor(() => expect(getComputedStyle(resolutionReply).opacity).toBe('1'));

    await userEvent.hover(defaultMore);
    expect(defaultMore).not.toHaveStyle({ backgroundColor: colors.light.primary });
    const moreHover = within(defaultMore).getByTestId('post-action-more-hover');
    expect(moreHover).toHaveStyle({ backgroundColor: colors.light.primary });
    expect(getComputedStyle(moreHover).opacity).toBe('0.3');
    expect(getComputedStyle(moreHover).borderRadius).toBe('999px');
    expect(getComputedStyle(moreHover).height).toBe('28px');
    expect(getComputedStyle(moreHover).width).toBe('28px');
    expect(defaultMore.querySelector('svg')).toHaveAttribute('stroke', colors.light.primary);
    expect(defaultMore.getBoundingClientRect().width).toBe(28);
    expect(defaultMore.getBoundingClientRect().height).toBe(36);
    await userEvent.unhover(defaultMore);
    expect(defaultMore.querySelector('svg')).toHaveAttribute('stroke', colors.light.textSecondary);
    expect(within(defaultMore).queryByTestId('post-action-more-hover')).toBeNull();

    for (const [label, testID, actionColor, defaultColor] of [
      ['재게시', 'repost', repostActionColors.light, colors.light.textSecondary],
      ['북마크', 'bookmark', colors.light.primary, colors.light.textSecondary],
    ] as const) {
      const button = defaultToolbarCanvas.getByRole('button', { name: label });
      const icon = button.querySelector('svg');
      expect(icon).toHaveAttribute('stroke', defaultColor);
      await userEvent.hover(button);
      const hover = within(button).getByTestId(`post-action-${testID}-hover`);
      expect(hover).toHaveStyle({ backgroundColor: actionColor });
      expect(getComputedStyle(hover).opacity).toBe('0.3');
      expect(getComputedStyle(hover).zIndex).toBe('0');
      expect(icon).toHaveAttribute('stroke', actionColor);
      expect(
        getComputedStyle(within(button).getByTestId(`post-action-${testID}-glyph`)).zIndex,
      ).toBe('1');
      if (testID === 'repost') {
        const count = button.querySelector('[dir="auto"]');
        expect(count).toHaveStyle({
          color: defaultColor,
        });
      }
      await userEvent.unhover(button);
      expect(icon).toHaveAttribute('stroke', defaultColor);
      expect(within(button).queryByTestId(`post-action-${testID}-hover`)).toBeNull();
      if (testID === 'repost') {
        const count = button.querySelector('[dir="auto"]');
        fireEvent.mouseDown(button, { buttons: 1 });
        await waitFor(() => expect(getComputedStyle(button).opacity).toBe('0.72'));
        expect(icon).toHaveAttribute('stroke', actionColor);
        expect(count).toHaveStyle({ color: defaultColor });
        fireEvent.mouseUp(button, { buttons: 0 });
        await waitFor(() => expect(getComputedStyle(button).opacity).toBe('1'));
        expect(icon).toHaveAttribute('stroke', defaultColor);
        expect(count).toHaveStyle({ color: defaultColor });
      }
    }

    const defaultReaction = defaultToolbarCanvas.getByRole('button', { name: '반응' });
    const defaultReactionIcon = defaultReaction.querySelector('svg');
    expect(defaultReactionIcon?.querySelector('path[d="M18 12v6"]')).not.toBeNull();
    expect(defaultReactionIcon).toHaveAttribute('stroke', colors.light.textSecondary);
    expect(defaultReactionIcon).toHaveAttribute('fill', 'none');
    await userEvent.hover(defaultReaction);
    expect(defaultReaction).not.toHaveStyle({ backgroundColor: reactionActionColor });
    const reactionHover = within(defaultReaction).getByTestId('post-action-reaction-hover');
    expect(reactionHover).toHaveStyle({ backgroundColor: reactionActionColor });
    expect(getComputedStyle(reactionHover).opacity).toBe('0.3');
    expect(getComputedStyle(reactionHover).borderRadius).toBe('999px');
    expect(getComputedStyle(reactionHover).height).toBe('28px');
    expect(getComputedStyle(reactionHover).width).toBe('28px');
    expect(defaultReactionIcon).toHaveAttribute('stroke', reactionActionColor);
    expect(defaultReactionIcon).toHaveAttribute('fill', 'none');
    await userEvent.unhover(defaultReaction);
    expect(defaultReactionIcon).toHaveAttribute('stroke', colors.light.textSecondary);
    expect(defaultReactionIcon).toHaveAttribute('fill', 'none');
    expect(within(defaultReaction).queryByTestId('post-action-reaction-hover')).toBeNull();

    const activeBookmark = within(toolbars[2]!).getByRole('button', { name: /북마크/ });
    expect(activeBookmark).toHaveAttribute('aria-pressed', 'true');
    const activeBookmarkIcon = activeBookmark.querySelector('svg');
    expect(activeBookmarkIcon).not.toHaveAttribute('fill', 'none');
    await userEvent.hover(activeBookmark);
    expect(activeBookmark).not.toHaveStyle({ backgroundColor: colors.light.primary });
    expect(within(activeBookmark).getByTestId('post-action-bookmark-hover')).toHaveStyle({
      backgroundColor: colors.light.primary,
    });
    expect(
      getComputedStyle(within(activeBookmark).getByTestId('post-action-bookmark-hover')).opacity,
    ).toBe('0.3');
    expect(activeBookmarkIcon).not.toHaveAttribute('fill', 'none');
    await userEvent.unhover(activeBookmark);
    expect(within(activeBookmark).queryByTestId('post-action-bookmark-hover')).toBeNull();

    const activeRepost = within(toolbars[2]!).getByRole('button', { name: '재게시 취소' });
    const activeRepostIcon = activeRepost.querySelector('svg');
    expect(activeRepostIcon).toHaveAttribute('stroke', repostActionColors.light);
    expect(activeRepost.querySelector('[dir="auto"]')).toHaveStyle({
      color: repostActionColors.light,
    });

    const activeReaction = within(toolbars[2]!).getByRole('button', { name: '반응' });
    const activeReactionIcon = activeReaction.querySelector('svg');
    expect(activeReactionIcon?.querySelector('path[d="M18 12v6"]')).not.toBeNull();
    expect(activeReactionIcon).toHaveAttribute('stroke', reactionActionColor);
    expect(activeReactionIcon).toHaveAttribute('fill', 'none');
    await userEvent.hover(activeReaction);
    expect(activeReactionIcon).toHaveAttribute('stroke', reactionActionColor);
    expect(activeReactionIcon).toHaveAttribute('fill', 'none');
    const activeReactionHover = within(activeReaction).getByTestId('post-action-reaction-hover');
    expect(activeReactionHover).toHaveStyle({ backgroundColor: reactionActionColor });
    expect(getComputedStyle(activeReactionHover).opacity).toBe('0.3');
    await userEvent.unhover(activeReaction);
    expect(activeReactionIcon).toHaveAttribute('stroke', reactionActionColor);
    expect(activeReactionIcon).toHaveAttribute('fill', 'none');
    expect(within(activeReaction).queryByTestId('post-action-reaction-hover')).toBeNull();

    const blockedReply = within(toolbars[3]!).getByRole('button', { name: '답글' });
    fireEvent.pointerEnter(blockedReply);
    expect(blockedReply).not.toHaveStyle({ backgroundColor: colors.light.primary });
    expect(within(blockedReply).queryByTestId('post-action-reply-hover')).toBeNull();

    const resolutionToolbar = within(toolbars[4]!);
    for (const [label, testID] of [
      ['답글', 'reply'],
      ['재게시', 'repost'],
      ['반응', 'reaction'],
      ['북마크', 'bookmark'],
    ] as const) {
      const button = resolutionToolbar.getByRole('button', { name: label });
      await userEvent.hover(button);
      expect(within(button).queryByTestId(`post-action-${testID}-hover`)).toBeNull();
      await userEvent.unhover(button);
    }
  },
};

export const ActionSemanticColorsDark: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
  render: () => <CatalogStory />,
};

export const ActionSemanticColorsDarkInteraction: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toolbars = canvas.getAllByRole('toolbar', { name: '액션 바' });
    const defaultToolbar = within(toolbars[0]!);
    const defaultRepost = defaultToolbar.getByRole('button', { name: '재게시' });
    const defaultRepostIcon = defaultRepost.querySelector('svg');

    expect(defaultRepostIcon).toHaveAttribute('stroke', colors.dark.textSecondary);
    expect(defaultRepost.querySelector('[dir="auto"]')).toHaveStyle({
      color: colors.dark.textSecondary,
    });
    await userEvent.hover(defaultRepost);
    expect(defaultToolbar.getByTestId('post-action-repost-hover')).toHaveStyle({
      backgroundColor: repostActionColors.dark,
    });
    expect(defaultRepostIcon).toHaveAttribute('stroke', repostActionColors.dark);
    expect(defaultRepost.querySelector('[dir="auto"]')).toHaveStyle({
      color: colors.dark.textSecondary,
    });
    await userEvent.unhover(defaultRepost);
    expect(defaultRepostIcon).toHaveAttribute('stroke', colors.dark.textSecondary);

    const defaultReaction = defaultToolbar.getByRole('button', { name: '반응' });
    const defaultReactionIcon = defaultReaction.querySelector('svg');
    expect(defaultReactionIcon).toHaveAttribute('stroke', colors.dark.textSecondary);
    await userEvent.hover(defaultReaction);
    expect(defaultToolbar.getByTestId('post-action-reaction-hover')).toHaveStyle({
      backgroundColor: reactionActionColor,
    });
    expect(defaultReactionIcon).toHaveAttribute('stroke', reactionActionColor);

    const activeToolbar = within(toolbars[2]!);
    const activeRepost = activeToolbar.getByRole('button', { name: '재게시 취소' });
    expect(activeRepost.querySelector('svg')).toHaveAttribute('stroke', repostActionColors.dark);
    expect(activeRepost.querySelector('[dir="auto"]')).toHaveStyle({
      color: repostActionColors.dark,
    });
    const activeReaction = activeToolbar.getByRole('button', { name: '반응' });
    expect(activeReaction.querySelector('svg')).toHaveAttribute('stroke', reactionActionColor);
    expect(activeReaction.querySelector('svg')).toHaveAttribute('fill', 'none');
  },
  render: () => <CatalogStory />,
};

export const AuthorPostDeletion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    deletionMutationRequest.mockClear();

    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: '더 보기 메뉴' });
    expect(within(menu).getByRole('menuitem', { name: '게시글 삭제' })).toBeVisible();
    await userEvent.click(within(menu).getByRole('menuitem', { name: '게시글 삭제' }));

    const dialog = await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    expect(dialog).toHaveTextContent('게시글을 삭제할까요?');
    expect(dialog).toHaveTextContent('삭제한 게시글은 복구할 수 없습니다.');
    await waitFor(() =>
      expect(canvasElement.ownerDocument.activeElement).toHaveTextContent('취소'),
    );
    expect(deletionMutationRequest).not.toHaveBeenCalled();

    const cancel = within(dialog).getByRole('button', { name: '취소' });
    const confirm = within(dialog).getByRole('button', { name: '삭제' });
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(canvasElement.ownerDocument.activeElement).toBe(confirm);
    await userEvent.keyboard('{Tab}');
    expect(canvasElement.ownerDocument.activeElement).toBe(cancel);

    await userEvent.click(cancel);
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeNull(),
    );
    expect(canvasElement.ownerDocument.activeElement).toBe(trigger);
    expect(deletionMutationRequest).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '더 보기 메뉴' })).getByRole('menuitem', {
        name: '게시글 삭제',
      }),
    );
    await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeNull(),
    );
    expect(canvasElement.ownerDocument.activeElement).toBe(trigger);

    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '더 보기 메뉴' })).getByRole('menuitem', {
        name: '게시글 삭제',
      }),
    );
    await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    await userEvent.click(screen.getByTestId('post-deletion-backdrop'));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeNull(),
    );
    expect(canvasElement.ownerDocument.activeElement).toBe(trigger);

    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '더 보기 메뉴' })).getByRole('menuitem', {
        name: '게시글 삭제',
      }),
    );
    await userEvent.click(
      within(await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' })).getByRole(
        'button',
        { name: '삭제' },
      ),
    );
    await waitFor(() => expect(deletionMutationRequest).toHaveBeenCalledTimes(1));
  },
  render: () => (
    <PostActionBarFixture
      onMutationRequest={deletionMutationRequest}
      selectedProfileId="profile-author"
    />
  ),
};

export const AuthorPostDeletionPending: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    deletionMutationRequest.mockClear();
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '더 보기 메뉴' })).getByRole('menuitem', {
        name: '게시글 삭제',
      }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' });
    const confirm = within(dialog).getByRole('button', { name: '삭제' });
    await userEvent.click(confirm);
    await waitFor(() => expect(deletionMutationRequest).toHaveBeenCalledTimes(1));
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeVisible();
    await userEvent.click(screen.getByTestId('post-deletion-backdrop'));
    expect(screen.getByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeVisible();
    expect(deletionMutationRequest).toHaveBeenCalledTimes(1);
  },
  render: () => (
    <PostActionBarFixture
      deleteOutcome="pending"
      onMutationRequest={deletionMutationRequest}
      selectedProfileId="profile-author"
    />
  ),
};

export const NonAuthorPostDeletionHidden: Story = {
  play: ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '더 보기' })).toBeNull();
  },
  render: () => <PostActionBarFixture selectedProfileId="profile-other" />,
};

export const GuestPostDeletionHidden: Story = {
  play: ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '더 보기' })).toBeNull();
  },
  render: () => <PostActionBarFixture selectedProfileId={null} />,
};

async function authorPostDeletionFailureRetryPlay({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) {
  const canvas = within(canvasElement);
  deletionMutationRequest.mockClear();
  await userEvent.click(canvas.getByRole('button', { name: '더 보기' }));
  await userEvent.click(
    within(await screen.findByRole('menu', { name: '더 보기 메뉴' })).getByRole('menuitem', {
      name: '게시글 삭제',
    }),
  );
  const dialog = await screen.findByRole('alertdialog', { name: '게시글 삭제 확인' });
  await userEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
  await waitFor(() => expect(deletionMutationRequest).toHaveBeenCalledTimes(1));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  expect(screen.getByRole('alertdialog', { name: '게시글 삭제 확인' })).toBeVisible();

  await userEvent.click(
    within(screen.getByRole('alertdialog', { name: '게시글 삭제 확인' })).getByRole('button', {
      name: '삭제',
    }),
  );
  await waitFor(() => expect(deletionMutationRequest).toHaveBeenCalledTimes(2));
}

export const AuthorPostDeletionFailureRetry: Story = {
  play: authorPostDeletionFailureRetryPlay,
  render: () => (
    <PostActionBarFixture
      deleteOutcome="network-error"
      onMutationRequest={deletionMutationRequest}
      selectedProfileId="profile-author"
    />
  ),
};

export const AuthorPostDeletionGraphQLErrorRetry: Story = {
  play: authorPostDeletionFailureRetryPlay,
  render: () => (
    <PostActionBarFixture
      deleteOutcome="graphql-error"
      onMutationRequest={deletionMutationRequest}
      selectedProfileId="profile-author"
    />
  ),
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
    const repostSpinnerCircles = repostSpinner.querySelectorAll('circle');
    expect(repostSpinnerCircles.length).toBeGreaterThan(0);
    for (const circle of repostSpinnerCircles) {
      expect(circle).toHaveStyle({ stroke: colors.light.textSecondary });
    }
    expect(repostButton.querySelector('[dir="auto"]')).toHaveStyle({
      color: colors.light.textSecondary,
    });
    fireEvent.pointerEnter(repostButton);
    expect(within(repostButton).queryByTestId('post-action-repost-hover')).toBeNull();
    expect(replySpinnerVisual.clientWidth).toBe(14);
    expect(replySpinnerVisual.clientHeight).toBe(14);
    expect(replySpinner.getBoundingClientRect().left).toBeCloseTo(
      replyButton.getBoundingClientRect().left + 6,
      0,
    );
    expect(repostSpinner.getBoundingClientRect().left).toBeCloseTo(
      repostButton.getBoundingClientRect().left + 6,
      0,
    );
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
      reactionSelected
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
    verifyHuggedActionTargets(actionBar);
    expect(buttons[0]).toHaveTextContent('0');
    expect(buttons[0]!.getBoundingClientRect().width).toBeGreaterThan(28);
  },
  render: () => (
    <PostActionBarFixture {...actionBarProps} reply={{ ...actionBarProps.reply, count: 0 }} />
  ),
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
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoFull' } },
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
  playground: { maxWidth: 600, width: '100%' } satisfies ViewStyle,
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

  expect(toolbarBounds.width).toBeCloseTo(expectedContentWidth, 0);
  expect(toolbarBounds.height).toBe(28);
  verifyHuggedActionTargets(toolbar);
}

function verifyHuggedActionTargets(toolbar: HTMLElement) {
  const toolbarBounds = toolbar.getBoundingClientRect();
  const toolbarCanvas = within(toolbar);
  const actions = [
    ['답글', 'reply', 50],
    ['재게시', 'repost', 50],
    ['반응', 'reaction', 50],
    ['북마크', 'bookmark', 50],
    ['더보기', 'more', 28],
  ] as const;
  let previousRight = toolbarBounds.left;

  for (const [label, testID, slotWidth] of actions) {
    const button = toolbarCanvas.getByRole('button', { name: label });
    const targetBounds = button.getBoundingClientRect();
    const slotBounds = button.parentElement!.getBoundingClientRect();
    const iconBounds = toolbarCanvas
      .getByTestId(`post-action-${testID}-icon`)
      .getBoundingClientRect();
    const count = button.querySelector('[dir="auto"]') as HTMLElement | null;

    expect(slotBounds.width).toBeCloseTo(Math.max(slotWidth, targetBounds.width), 0);
    expect(slotBounds.height).toBe(28);
    expect(targetBounds.height).toBe(36);
    expect(targetBounds.width).toBeGreaterThanOrEqual(24);
    expect(targetBounds.top + targetBounds.height / 2).toBeCloseTo(
      toolbarBounds.top + toolbarBounds.height / 2,
      0,
    );
    if (label === '답글') {
      expect(targetBounds.left).toBeCloseTo(slotBounds.left, 0);
    } else {
      expect(targetBounds.left + targetBounds.width / 2).toBeCloseTo(
        slotBounds.left + slotBounds.width / 2,
        0,
      );
    }
    expect(iconBounds.left - targetBounds.left).toBeCloseTo(6, 0);

    if (count) {
      const countBounds = count.getBoundingClientRect();
      expect(countBounds.left - iconBounds.right).toBeCloseTo(spacing.xs, 0);
      expect(targetBounds.right - countBounds.right).toBeCloseTo(6, 0);
      expect(targetBounds.width).toBeCloseTo(
        6 + iconBounds.width + spacing.xs + countBounds.width + 6,
        0,
      );
    } else {
      expect(targetBounds.width).toBe(28);
      expect(targetBounds.right - iconBounds.right).toBeCloseTo(6, 0);
    }

    expect(targetBounds.left).toBeGreaterThanOrEqual(previousRight);
    expect(targetBounds.right).toBeLessThanOrEqual(toolbarBounds.right);
    previousRight = targetBounds.right;
  }

  const buttons = toolbarCanvas.getAllByRole('button');
  expect(buttons[0]!.parentElement!.getBoundingClientRect().left).toBeCloseTo(
    toolbarBounds.left,
    0,
  );
  expect(buttons[4]!.parentElement!.getBoundingClientRect().right).toBeCloseTo(
    toolbarBounds.right,
    0,
  );
}
