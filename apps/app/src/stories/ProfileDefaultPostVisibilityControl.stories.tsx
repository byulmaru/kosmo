import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { expect, userEvent, within } from 'storybook/test';
import { ProfileDefaultPostVisibilityControl } from '@/components/profile/ProfileDefaultPostVisibilityControl';
import ProfileDefaultPostVisibilityControlStoriesQueryNode from './__generated__/ProfileDefaultPostVisibilityControlStoriesQuery.graphql';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { ProfileDefaultPostVisibilityControlStoriesQuery } from './__generated__/ProfileDefaultPostVisibilityControlStoriesQuery.graphql';

const profileId = 'profile-default-visibility-owner';

const query = graphql`
  query ProfileDefaultPostVisibilityControlStoriesQuery($id: ID!) {
    node(id: $id) {
      ... on Profile {
        ...ProfileDefaultPostVisibilityControl_profile @alias(as: "profile")
      }
    }
  }
`;

type Mode = 'error-once' | 'pending' | 'success';

function createEnvironment({
  defaultPostVisibility,
  mode,
  onPending,
  targetId,
}: {
  defaultPostVisibility: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
  mode: Mode;
  onPending: (complete: () => void) => void;
  targetId: string;
}) {
  let attempts = 0;
  const environment = new Environment({
    network: Network.create((request: RequestParameters, variables: Variables) => {
      if (request.name === 'ProfileDefaultPostVisibilityControlMutation') {
        attempts += 1;
        if (mode === 'pending' && attempts === 1) {
          return Observable.create<GraphQLResponse>((sink) => {
            onPending(() => {
              sink.next({
                data: {
                  updateProfile: {
                    profile: {
                      __typename: 'Profile',
                      defaultPostVisibility: variables.input.defaultPostVisibility,
                      id: targetId,
                    },
                  },
                },
              });
              sink.complete();
            });
          });
        }
        if (mode === 'error-once' && attempts === 1) {
          return Promise.reject(new Error('settings failed'));
        }
        return Promise.resolve({
          data: {
            updateProfile: {
              profile: {
                __typename: 'Profile',
                defaultPostVisibility: variables.input.defaultPostVisibility,
                id: targetId,
              },
            },
          },
        } as GraphQLResponse);
      }
      return Promise.resolve({ data: {} } as GraphQLResponse);
    }),
    store: new Store(new RecordSource()),
  });
  environment.commitPayload(
    createOperationDescriptor(getRequest(ProfileDefaultPostVisibilityControlStoriesQueryNode), {
      id: targetId,
    }),
    {
      node: {
        __typename: 'Profile',
        defaultPostVisibility,
        displayName: targetId.endsWith(':1') ? '두 번째 Profile' : '현재 Profile',
        id: targetId,
      },
    },
  );
  return environment;
}

function ProfileDefaultPostVisibilityStory({
  editable = true,
  initial = 'UNLISTED',
  mode = 'success',
}: {
  editable?: boolean;
  initial?: 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
  mode?: Mode;
}) {
  const [revision, setRevision] = useState(0);
  const pendingCompletionRef = useRef<(() => void) | null>(null);
  const environment = useMemo(
    () =>
      createEnvironment({
        defaultPostVisibility: revision === 0 ? initial : 'FOLLOWERS',
        mode,
        onPending: (complete) => {
          pendingCompletionRef.current = complete;
        },
        targetId: `${profileId}:${revision}`,
      }),
    [initial, mode, revision],
  );

  return (
    <View>
      <RelayEnvironmentProvider environment={environment}>
        <ProfileDefaultPostVisibilityStoryContents editable={editable} revision={revision} />
      </RelayEnvironmentProvider>
      {mode === 'pending' ? (
        <Pressable
          accessibilityLabel="Profile과 Environment 전환"
          onPress={() => setRevision((value) => value + 1)}
        >
          <Text>Profile과 Environment 전환</Text>
        </Pressable>
      ) : null}
      {mode === 'pending' ? (
        <Pressable
          accessibilityLabel="이전 저장 완료"
          onPress={() => pendingCompletionRef.current?.()}
        >
          <Text>이전 저장 완료</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfileDefaultPostVisibilityStoryContents({
  editable,
  revision,
}: {
  editable: boolean;
  revision: number;
}) {
  const data = useLazyLoadQuery<ProfileDefaultPostVisibilityControlStoriesQuery>(
    query,
    { id: `${profileId}:${revision}` },
    { fetchPolicy: 'store-only' },
  );
  const profile = data.node?.profile;
  if (!profile) {
    return <Text>Profile fixture를 불러오지 못했어요.</Text>;
  }
  return <ProfileDefaultPostVisibilityControl editable={editable} profile={profile} />;
}

const meta = {
  component: ProfileDefaultPostVisibilityStory,
  title: 'KOSMO/Profile/Default Post Visibility Control',
} satisfies Meta<typeof ProfileDefaultPostVisibilityStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerOptionsAndSuccess: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const option = canvas.getByRole('radio', { name: '공개: 모두가 볼 수 있어요.' });
    await userEvent.click(option);
    expect(option).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(canvas.getByRole('button', { name: '기본 게시 공개 범위 저장' }));
    await expect(canvas.findByText('저장했어요.')).resolves.toBeTruthy();
  },
  render: () => <ProfileDefaultPostVisibilityStory initial="UNLISTED" />,
};

export const MemberReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('Profile Member는 조회만 할 수 있어요.')).toBeTruthy();
    expect(canvas.getByRole('radio', { name: '공개: 모두가 볼 수 있어요.' })).toBeDisabled();
  },
  render: () => <ProfileDefaultPostVisibilityStory editable={false} />,
};

export const FailureAndRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: '팔로워만: 팔로워만 볼 수 있어요.' }));
    await userEvent.click(canvas.getByRole('button', { name: '기본 게시 공개 범위 저장' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '기본 공개 범위를 저장하지 못했어요.',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('저장했어요.')).resolves.toBeTruthy();
  },
  render: () => <ProfileDefaultPostVisibilityStory mode="error-once" />,
};

export const LateCompletionIgnoredAfterProfileEnvironmentTransition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: '공개: 모두가 볼 수 있어요.' }));
    await userEvent.click(canvas.getByRole('button', { name: '기본 게시 공개 범위 저장' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Profile과 Environment 전환' }));
    await userEvent.click(canvas.getByRole('button', { name: '이전 저장 완료' }));
    expect(canvas.queryByText('저장했어요.')).toBeNull();
    expect(canvas.getByText('Profile과 Environment 전환')).toBeTruthy();
  },
  render: () => <ProfileDefaultPostVisibilityStory mode="pending" />,
};
