import { useCallback, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { graphql, RelayEnvironmentProvider, useLazyLoadQuery } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { RelayActorBoundary, RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import RepostActionStoryQueryNode from './__generated__/RepostActionStoryQuery.graphql';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { RepostActionStoryQuery } from './__generated__/RepostActionStoryQuery.graphql';

const sourcePostId = 'post-source';
const activeRepostId = 'post-repost-active';

const repostActionStoryQuery = graphql`
  query RepostActionStoryQuery($id: ID!) {
    node(id: $id) {
      ... on Post {
        ...PostActionBar_post @alias(as: "actionBar")
      }
    }
  }
`;

function RepostActionStory({ storeOnly = false }: { storeOnly?: boolean }) {
  const [errorCount, setErrorCount] = useState(0);
  const [failureActions, setFailureActions] = useState<string[]>([]);
  const data = useLazyLoadQuery<RepostActionStoryQuery>(
    repostActionStoryQuery,
    { id: sourcePostId },
    storeOnly ? { fetchPolicy: 'store-only' } : undefined,
  );
  return (
    <View>
      <PostActionBar
        onRepostError={(failure) => {
          setErrorCount((count) => count + 1);
          setFailureActions((actions) => [...actions, failure.action]);
        }}
        post={data.node!.actionBar!}
      />
      <Text testID="repost-error-count">{errorCount}</Text>
      <Text testID="repost-failure-actions">{JSON.stringify(failureActions)}</Text>
    </View>
  );
}

function ResetActor() {
  const { resetActor } = useRelayActor();

  return (
    <View>
      <Text
        accessibilityLabel="두 번째 프로필로 전환"
        accessibilityRole="button"
        onPress={() => resetActor('profile-b')}
      >
        두 번째 프로필로 전환
      </Text>
      <Text testID="actor">현재 Profile</Text>
    </View>
  );
}

function ActorResetIgnoresStaleCallbacksStory() {
  const staleActorRequest = useRef<((error: Error) => void) | null>(null);
  const mutationRequestCount = useRef(0);
  const [mutationRequests, setMutationRequests] = useState(0);
  const createEnvironment = useCallback(() => {
    const environment = new Environment({
      network: Network.create((request) => {
        return Observable.create((sink) => {
          if (request.operationKind !== 'mutation') {
            sink.next({ data: { node: unselectedSource } } as GraphQLResponse);
            sink.complete();
            return;
          }

          setMutationRequests((count) => count + 1);
          if (mutationRequestCount.current++ === 0) {
            staleActorRequest.current = (error) => sink.error(error);
          }
        });
      }),
      store: new Store(new RecordSource()),
    });
    environment.commitPayload(
      createOperationDescriptor(getRequest(RepostActionStoryQueryNode), { id: sourcePostId }),
      { node: unselectedSource },
    );
    return environment;
  }, []);

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      <RelayActorBoundary>
        <RepostActionStory storeOnly />
        <ResetActor />
        <Text
          accessibilityLabel="첫 번째 프로필 요청 실패"
          accessibilityRole="button"
          onPress={() => staleActorRequest.current?.(new Error('첫 번째 프로필 요청 실패'))}
        >
          첫 번째 프로필 요청 실패
        </Text>
        <Text testID="repost-mutation-request-count">{mutationRequests}</Text>
      </RelayActorBoundary>
    </RelayActorProvider>
  );
}

type MutationFailure = 'graphql' | 'network' | undefined;

function CapturedRepostActionStory({
  failure,
  initialSource = unselectedSource,
}: {
  failure?: MutationFailure;
  initialSource?: typeof unselectedSource | typeof selectedSource;
}) {
  const [requests, setRequests] = useState<Array<{ name: string; variables: Variables }>>([]);
  const environment = useMemo(() => {
    const result = new Environment({
      network: Network.create((request: RequestParameters, variables: Variables) => {
        if (request.operationKind !== 'mutation') {
          return Promise.resolve({ data: { node: unselectedSource } } as GraphQLResponse);
        }

        setRequests((current) => [...current, { name: request.name, variables }]);
        if (failure === 'network') {
          return Promise.reject(new Error('network failed'));
        }
        if (failure === 'graphql') {
          return Promise.resolve({
            data: { repostPost: null },
            errors: [{ message: 'graphql failed' }],
          });
        }
        if (request.name === 'RepostActionRepostPostMutation') {
          return Promise.resolve({
            data: {
              repostPost: {
                repost: { __typename: 'Post', id: activeRepostId, repostSource: selectedSource },
              },
            },
          });
        }

        return Promise.resolve({ data: { deletePost: { postId: activeRepostId } } });
      }),
      store: new Store(new RecordSource()),
    });
    result.commitPayload(
      createOperationDescriptor(getRequest(RepostActionStoryQueryNode), { id: sourcePostId }),
      { node: initialSource },
    );
    return result;
  }, [failure]);

  return (
    <RelayEnvironmentProvider environment={environment}>
      <CapturedRepostActionControls />
      <Text testID="repost-request-log">{JSON.stringify(requests)}</Text>
    </RelayEnvironmentProvider>
  );
}

function CapturedRepostActionControls() {
  const [errorCount, setErrorCount] = useState(0);
  const [failureActions, setFailureActions] = useState<string[]>([]);
  const data = useLazyLoadQuery<RepostActionStoryQuery>(
    repostActionStoryQuery,
    { id: sourcePostId },
    { fetchPolicy: 'store-only' },
  );
  return (
    <View>
      <PostActionBar
        onRepostError={(failure) => {
          setErrorCount((count) => count + 1);
          setFailureActions((actions) => [...actions, failure.action]);
        }}
        post={data.node!.actionBar!}
      />
      <Text testID="repost-error-count">{errorCount}</Text>
      <Text testID="repost-failure-actions">{JSON.stringify(failureActions)}</Text>
    </View>
  );
}

const unselectedSource = {
  __typename: 'Post',
  id: sourcePostId,
  repostCount: 3,
  viewerBookmark: null,
  viewerRepost: null,
  viewerReactions: [],
};
const selectedSource = {
  ...unselectedSource,
  repostCount: 4,
  viewerRepost: { __typename: 'Post', id: activeRepostId },
  viewerReactions: [],
};

const meta = {
  component: RepostActionStory,
  title: 'KOSMO/Post/Repost Action',
} satisfies Meta<typeof RepostActionStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreatesRepost: Story = {
  parameters: {
    relay: {
      data: { node: unselectedSource },
      mutationResponse: {
        repostPost: {
          repost: {
            __typename: 'Post',
            id: activeRepostId,
            repostSource: selectedSource,
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: '재게시' });
    const triggerRect = trigger.getBoundingClientRect();
    const triggerPointer = {
      x: triggerRect.left + triggerRect.width / 2,
      y: triggerRect.top + triggerRect.height / 2,
    };
    await userEvent.pointer({ coords: triggerPointer, keys: '[MouseLeft]', target: trigger });
    const menu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    const menuItem = within(menu).getByRole('menuitem', { name: '재게시하기' });
    const menuIcon = menuItem.querySelector('svg')!;
    const menuLabel = within(menuItem).getByText('재게시하기');
    const menuRect = menu.getBoundingClientRect();
    const menuItemRect = menuItem.getBoundingClientRect();
    const menuStyle = getComputedStyle(menu);
    const menuLabelStyle = getComputedStyle(menuLabel);
    const menuItemStyle = getComputedStyle(menuItem);
    const triggerPoints = [
      { x: triggerRect.left + 1, y: triggerRect.top + 1 },
      triggerPointer,
      { x: triggerRect.right - 1, y: triggerRect.bottom - 1 },
    ];
    const secondPointerTarget = canvasElement.ownerDocument.elementFromPoint(
      triggerPointer.x,
      triggerPointer.y,
    );

    expect(menuItem).toBeVisible();
    expect(canvasElement.contains(menu)).toBe(false);
    expect(menuStyle.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(menuStyle.borderWidth).toBe('1px');
    expect(menuStyle.boxShadow).toBe('rgba(0, 0, 0, 0.12) 0px 2px 4px 0px');
    expect(menuStyle.padding).toBe('4px');
    expect(menuRect.width).toBeLessThan(160);
    expect(menuRect.height).toBe(46);
    expect(menuItemRect.height).toBe(36);
    expect(menuItemStyle.paddingLeft).toBe('8px');
    expect(menuItemStyle.paddingRight).toBe('8px');
    expect(menuItemStyle.columnGap).toBe('8px');
    expect(menuLabelStyle.fontSize).toBe('14px');
    expect(menuLabelStyle.fontWeight).toBe('500');
    expect(menuIcon).toHaveAttribute('width', '18');
    expect(menuIcon).toHaveAttribute('height', '18');
    expect(menuItemRect.left).toBeLessThanOrEqual(triggerPointer.x);
    expect(menuItemRect.right).toBeGreaterThanOrEqual(triggerPointer.x);
    expect(menuItemRect.top).toBeLessThanOrEqual(triggerPointer.y);
    expect(menuItemRect.bottom).toBeGreaterThanOrEqual(triggerPointer.y);
    expect(
      triggerPoints.map((point) =>
        menuItem.contains(canvasElement.ownerDocument.elementFromPoint(point.x, point.y)),
      ),
    ).toEqual([true, true, true]);
    expect(canvas.getByTestId('repost-request-log')).toHaveTextContent('[]');
    await userEvent.pointer({
      coords: triggerPointer,
      keys: '[MouseLeft]',
      target: secondPointerTarget as Element,
    });
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
  render: () => <CapturedRepostActionStory />,
};

export const CancelsWithActiveRepost: Story = {
  parameters: {
    relay: {
      data: { node: selectedSource },
      mutationResponse: { deletePost: { postId: activeRepostId } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole('button', { name: '재게시 취소' });
    await userEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: '재게시 취소' }));
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(canvas.getByTestId('repost-request-log')).toHaveTextContent('"id":"post-repost-active"');
  },
  render: () => <CapturedRepostActionStory initialSource={selectedSource} />,
};

export const FailureAllowsRetry: Story = {
  parameters: { relay: { data: { node: unselectedSource }, mutationError: 'mutation failed' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(button);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-failure-actions')).toHaveTextContent('["create"]');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
  },
};

export const PendingIsDisabled: Story = {
  parameters: { relay: { data: { node: unselectedSource }, mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(button);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByRole('button', { name: '재게시' })).resolves.toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(button).toBeDisabled();
    button.click();
    expect(button).toBeDisabled();
  },
};

export const ActorResetUsesNewStore: Story = {
  parameters: {
    relay: {
      operationResponses: {
        RepostActionStoryQuery: [
          { data: { node: selectedSource } },
          { data: { node: unselectedSource } },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '두 번째 프로필로 전환' }));
    await expect(canvas.findByRole('button', { name: '재게시' })).resolves.toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
  render: () => (
    <>
      <RepostActionStory />
      <ResetActor />
    </>
  ),
};

export const ActorResetIgnoresStaleCallbacks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const repost = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(repost);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await waitFor(() =>
      expect(canvas.getByTestId('repost-mutation-request-count')).toHaveTextContent('1'),
    );

    await userEvent.click(canvas.getByRole('button', { name: '두 번째 프로필로 전환' }));
    await waitFor(() => expect(canvas.getByTestId('actor')).toHaveTextContent('현재 Profile'));
    const secondActorRepost = canvas.getByRole('button', { name: '재게시' });
    await userEvent.click(secondActorRepost);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await waitFor(() =>
      expect(canvas.getByTestId('repost-mutation-request-count')).toHaveTextContent('2'),
    );
    await waitFor(() => expect(secondActorRepost).toHaveAttribute('aria-busy', 'true'));

    await userEvent.click(canvas.getByRole('button', { name: '첫 번째 프로필 요청 실패' }));
    expect(canvas.getByTestId('repost-error-count')).toHaveTextContent('0');
    expect(secondActorRepost).toHaveAttribute('aria-busy', 'true');
  },
  render: () => <ActorResetIgnoresStaleCallbacksStory />,
};

export const RequestVariablesAndDuplicateGuard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const createTrigger = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(createTrigger);
    const createMenu = await screen.findByRole('menu', { name: '재게시 메뉴' });
    expect(within(createMenu).queryByRole('menuitem', { name: '인용하기' })).toBeNull();
    const createItem = within(createMenu).getByRole('menuitem', { name: '재게시하기' });
    createItem.click();
    createItem.click();
    await expect(canvas.findByTestId('repost-request-log')).resolves.toHaveTextContent(
      '"sourceId":"post-source"',
    );
    expect(canvas.getByTestId('repost-request-log')).toHaveTextContent(
      'RepostActionRepostPostMutation',
    );
    expect(
      canvas
        .getByTestId('repost-request-log')
        .textContent?.match(/RepostActionRepostPostMutation/g),
    ).toHaveLength(1);
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '재게시 취소' }));
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    );
    await expect(canvas.findByTestId('repost-request-log')).resolves.toHaveTextContent(
      '"id":"post-repost-active"',
    );
    expect(canvas.getByRole('button', { name: '재게시 취소' })).toHaveTextContent('4');
  },
  render: () => <CapturedRepostActionStory />,
};

export const NetworkErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-failure-actions')).toHaveTextContent('["create"]');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
  },
  render: () => <CapturedRepostActionStory failure="network" />,
};

export const GraphQLErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-failure-actions')).toHaveTextContent('["create"]');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시하기',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
  },
  render: () => <CapturedRepostActionStory failure="graphql" />,
};

export const CancelNetworkErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '재게시 취소' });
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-failure-actions')).toHaveTextContent('["cancel"]');
    expect(canvas.getByRole('button', { name: '재게시 취소' })).toHaveTextContent('4');
    await userEvent.click(action);
    await userEvent.click(
      within(await screen.findByRole('menu', { name: '재게시 메뉴' })).getByRole('menuitem', {
        name: '재게시 취소',
      }),
    );
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
  },
  render: () => <CapturedRepostActionStory failure="network" initialSource={selectedSource} />,
};
