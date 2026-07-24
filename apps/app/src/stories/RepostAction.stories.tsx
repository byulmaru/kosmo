import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { graphql, RelayEnvironmentProvider, useLazyLoadQuery } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import { expect, userEvent, within } from 'storybook/test';
import { PostActionBar } from '@/components/post/PostActionBar';
import { useRepostAction } from '@/components/post/useRepostAction';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
        ...useRepostAction_post @alias(as: "post")
      }
    }
  }
`;

function RepostActionStory() {
  const [errorCount, setErrorCount] = useState(0);
  const data = useLazyLoadQuery<RepostActionStoryQuery>(repostActionStoryQuery, {
    id: sourcePostId,
  });
  const repost = useRepostAction(data.node!.post!, {
    onError: () => setErrorCount((count) => count + 1),
  });

  return (
    <View>
      <PostActionBar repost={repost} />
      <Text testID="repost-error-count">{errorCount}</Text>
    </View>
  );
}

function ResetActor() {
  const { resetActor } = useRelayActor();

  return (
    <Text
      accessibilityLabel="두 번째 프로필로 전환"
      accessibilityRole="button"
      onPress={() => resetActor('profile-b')}
    >
      두 번째 프로필로 전환
    </Text>
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
        if (request.name === 'useRepostActionRepostPostMutation') {
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
  const repost = useRepostAction(data.node!.post!, {
    onError: () => setErrorCount((count) => count + 1),
  });

  return (
    <View>
      <PostActionBar repost={repost} />
      <Text
        accessibilityLabel="두 번 재게시 실행"
        accessibilityRole="button"
        onPress={() => {
          repost.onPress();
          repost.onPress();
        }}
      >
        두 번 재게시 실행
      </Text>
      <Text testID="repost-error-count">{errorCount}</Text>
      <Text testID="repost-state">{`${repost.accessibilityLabel}:${repost.count}`}</Text>
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

export const HookRequestVariablesAndDuplicateGuard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('button', { name: '재게시' })).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '두 번 재게시 실행' }));
    await expect(canvas.findByTestId('repost-request-log')).resolves.toHaveTextContent(
      '"sourceId":"post-source"',
    );
    expect(canvas.getByTestId('repost-request-log')).toHaveTextContent(
      'useRepostActionRepostPostMutation',
    );
    expect(
      canvas
        .getByTestId('repost-request-log')
        .textContent?.match(/useRepostActionRepostPostMutation/g),
    ).toHaveLength(1);
    await expect(canvas.findByRole('button', { name: '재게시 취소' })).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '재게시 취소' }));
    await expect(canvas.findByTestId('repost-request-log')).resolves.toHaveTextContent(
      '"id":"post-repost-active"',
    );
    expect(canvas.getByTestId('repost-state')).toHaveTextContent('재게시 취소:4');
  },
  render: () => <CapturedRepostActionStory />,
};

export const HookNetworkErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '두 번 재게시 실행' });
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-state')).toHaveTextContent('재게시:3');
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByTestId('repost-state')).toHaveTextContent('재게시:3');
  },
  render: () => <CapturedRepostActionStory failure="network" />,
};

export const HookGraphQLErrorKeepsSourceAndRetries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = await canvas.findByRole('button', { name: '두 번 재게시 실행' });
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('1');
    expect(canvas.getByTestId('repost-state')).toHaveTextContent('재게시:3');
    await userEvent.click(action);
    await expect(canvas.findByTestId('repost-error-count')).resolves.toHaveTextContent('2');
    expect(canvas.getByTestId('repost-state')).toHaveTextContent('재게시:3');
  },
  render: () => <CapturedRepostActionStory failure="graphql" />,
};
