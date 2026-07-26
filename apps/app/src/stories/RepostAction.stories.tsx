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
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
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
  const data = useLazyLoadQuery<RepostActionStoryQuery>(
    repostActionStoryQuery,
    { id: sourcePostId },
    storeOnly ? { fetchPolicy: 'store-only' } : undefined,
  );
  return (
    <View>
      <PostActionBar
        onRepostError={() => setErrorCount((count) => count + 1)}
        post={data.node!.actionBar!}
      />
      <Text testID="repost-error-count">{errorCount}</Text>
    </View>
  );
}

function ResetActor() {
  const { resetActor, revision } = useRelayActor();

  return (
    <View>
      <Text
        accessibilityLabel="두 번째 프로필로 전환"
        accessibilityRole="button"
        onPress={() => resetActor('profile-b')}
      >
        두 번째 프로필로 전환
      </Text>
      <Text testID="actor-revision">{revision}</Text>
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
    </RelayActorProvider>
  );
}

type MutationFailure = 'graphql' | 'network' | undefined;

function CapturedRepostActionStory({ failure }: { failure?: MutationFailure }) {
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
      { node: unselectedSource },
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
  const data = useLazyLoadQuery<RepostActionStoryQuery>(
    repostActionStoryQuery,
    { id: sourcePostId },
    { fetchPolicy: 'store-only' },
  );
  return (
    <View>
      <PostActionBar
        onRepostError={() => setErrorCount((count) => count + 1)}
        post={data.node!.actionBar!}
      />
      <Text
        accessibilityLabel="두 번 재게시 실행"
        accessibilityRole="button"
        onPress={() => {
          const repostButton = document.querySelector<HTMLElement>(
            '[data-testid="post-action-repost"]',
          );
          repostButton?.click();
          repostButton?.click();
        }}
      >
        두 번 재게시 실행
      </Text>
      <Text testID="repost-error-count">{errorCount}</Text>
    </View>
  );
}

const unselectedSource = {
  __typename: 'Post',
  id: sourcePostId,
  repostCount: 3,
  viewerRepost: null,
};
const selectedSource = {
  ...unselectedSource,
  repostCount: 4,
  viewerRepost: { __typename: 'Post', id: activeRepostId },
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
    const button = await canvas.findByRole('button', { name: '재게시' });
    button.click();
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
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
    const button = await canvas.findByRole('button', { name: '재게시 취소' });
    await userEvent.click(button);
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const FailureAllowsRetry: Story = {
  parameters: { relay: { data: { node: unselectedSource }, mutationError: 'mutation failed' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(button);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
  },
};

export const PendingIsDisabled: Story = {
  parameters: { relay: { data: { node: unselectedSource }, mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '재게시' });
    await userEvent.click(button);
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
    await waitFor(() =>
      expect(canvas.getByTestId('repost-mutation-request-count')).toHaveTextContent('1'),
    );

    await userEvent.click(canvas.getByRole('button', { name: '두 번째 프로필로 전환' }));
    await waitFor(() => expect(canvas.getByTestId('actor-revision')).toHaveTextContent('1'));
    const secondActorRepost = canvas.getByRole('button', { name: '재게시' });
    await userEvent.click(secondActorRepost);
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
    await expect(canvas.findByRole('button', { name: '재게시' })).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '두 번 재게시 실행' }));
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
    const action = await canvas.findByRole('button', { name: '두 번 재게시 실행' });
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
  },
  render: () => <CapturedRepostActionStory failure="network" />,
};

export const GraphQLErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '두 번 재게시 실행' });
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByRole('button', { name: '재게시' })).toHaveTextContent('3');
  },
  render: () => <CapturedRepostActionStory failure="graphql" />,
};
