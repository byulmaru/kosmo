import { useCallback, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProfileMigrationSourceControl } from '@/components/profile/ProfileMigrationSourceControl';
import { RelayActorBoundary, RelayActorProvider, useRelayActor } from '@/relay/RelayActorProvider';
import ProfileMigrationSourceControlStoriesQueryNode from './__generated__/ProfileMigrationSourceControlStoriesQuery.graphql';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters, Variables } from 'relay-runtime';
import type { ProfileMigrationSourceControlStoriesQuery } from './__generated__/ProfileMigrationSourceControlStoriesQuery.graphql';

const profileId = 'profile-migration-source-owner';
const preparedSource = {
  __typename: 'Profile' as const,
  displayName: '원격 원본 Profile',
  id: 'profile-migration-source',
  relativeHandle: '@source@remote.example',
};
const longPreparedSource = {
  __typename: 'Profile' as const,
  displayName: '아주 긴 원격 원본 프로필 표시 이름 테스트',
  id: 'profile-migration-source-long',
  relativeHandle: '@a-very-long-source-handle-for-mobile-reflow@remote.example',
};

const query = graphql`
  query ProfileMigrationSourceControlStoriesQuery($id: ID!) {
    node(id: $id) {
      ... on Profile {
        ...ProfileMigrationSourceControl_profile @alias(as: "profile")
      }
    }
  }
`;

type Mode = 'error-once' | 'pending' | 'success';

function createEnvironment({
  initialSource,
  mode,
  onMutationAttempt,
  onPending,
  sourceFixture,
  targetCanonicalOrigin,
  targetId,
}: {
  initialSource: typeof preparedSource | null;
  mode: Mode;
  onMutationAttempt: (attempt: number) => void;
  onPending: (complete: () => void) => void;
  sourceFixture: typeof preparedSource;
  targetCanonicalOrigin: string | null;
  targetId: string;
}) {
  let attempts = 0;
  const environment = new Environment({
    network: Network.create((request: RequestParameters, variables: Variables) => {
      if (request.name === 'ProfileMigrationSourceControlMutation') {
        attempts += 1;
        onMutationAttempt(attempts);
        if (mode === 'pending' && attempts === 1) {
          return Observable.create<GraphQLResponse>((sink) => {
            onPending(() => {
              sink.next({
                data: preparePayload(targetId, variables, sourceFixture, targetCanonicalOrigin),
              });
              sink.complete();
            });
          });
        }
        if (mode === 'error-once' && attempts === 1) {
          return Promise.reject(new Error('profile migration preparation failed'));
        }
        return Promise.resolve({
          data: preparePayload(targetId, variables, sourceFixture, targetCanonicalOrigin),
        } as GraphQLResponse);
      }
      if (request.name === 'ProfileMigrationSourceControlUnregisterMutation') {
        attempts += 1;
        onMutationAttempt(attempts);
        return Promise.resolve({
          data: {
            unregisterProfileMigrationSource: {
              profile: {
                __typename: 'Profile',
                displayName: '현재 Profile',
                handle: 'target',
                id: targetId,
                instance: { __typename: 'ProfileInstance', canonicalOrigin: targetCanonicalOrigin },
                migrationSource: null,
                relativeHandle: '@target',
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
    createOperationDescriptor(getRequest(ProfileMigrationSourceControlStoriesQueryNode), {
      id: targetId,
    }),
    {
      node: {
        __typename: 'Profile',
        displayName: '현재 Profile',
        handle: 'target',
        id: targetId,
        instance: { __typename: 'ProfileInstance', canonicalOrigin: targetCanonicalOrigin },
        migrationSource: initialSource,
        relativeHandle: '@target',
      },
    },
  );
  return environment;
}

function preparePayload(
  targetId: string,
  variables: Variables,
  sourceFixture: typeof preparedSource,
  targetCanonicalOrigin: string | null,
) {
  const input = variables.input as { sourceHandle: string };
  return {
    registerProfileMigrationSource: {
      profile: {
        __typename: 'Profile',
        displayName: '현재 Profile',
        handle: 'target',
        id: targetId,
        instance: { __typename: 'ProfileInstance', canonicalOrigin: targetCanonicalOrigin },
        migrationSource: {
          ...sourceFixture,
          relativeHandle: input.sourceHandle.trim(),
        },
        relativeHandle: '@target',
      },
    },
  };
}

function ProfileMigrationSourceStory({
  editable = true,
  initialSource = null,
  mode = 'success',
  onMutationAttempt,
  sourceFixture = preparedSource,
  targetCanonicalOrigin = 'https://selected-profile.example',
}: {
  editable?: boolean;
  initialSource?: typeof preparedSource | null;
  mode?: Mode;
  onMutationAttempt: () => void;
  sourceFixture?: typeof preparedSource;
  targetCanonicalOrigin?: string | null;
}) {
  const pendingCompletionRef = useRef<(() => void) | null>(null);
  const createActorEnvironment = useCallback(
    () =>
      createEnvironment({
        initialSource,
        mode,
        onMutationAttempt,
        onPending: (complete) => {
          pendingCompletionRef.current = complete;
        },
        sourceFixture,
        targetCanonicalOrigin,
        targetId: profileId,
      }),
    [initialSource, mode, onMutationAttempt, sourceFixture, targetCanonicalOrigin],
  );

  return (
    <View>
      <RelayActorProvider createEnvironment={createActorEnvironment}>
        <InitializeStoryActor profileId={profileId} />
        <RelayActorBoundary>
          <ProfileMigrationSourceStoryContents editable={editable} profileId={profileId} />
        </RelayActorBoundary>
        {mode === 'pending' ? (
          <ActorTransitionActions
            completePending={() => pendingCompletionRef.current?.()}
            profileId={profileId}
          />
        ) : null}
      </RelayActorProvider>
    </View>
  );
}

function InitializeStoryActor({ profileId }: { profileId: string }) {
  const { resetActor } = useRelayActor();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      resetActor(profileId);
    }
  }, [profileId, resetActor]);

  return null;
}

function ActorTransitionActions({
  completePending,
  profileId,
}: {
  completePending: () => void;
  profileId: string;
}) {
  const { resetActor } = useRelayActor();
  return (
    <>
      <Pressable
        accessibilityLabel="현재 Profile 환경 재설정"
        accessibilityRole="button"
        onPress={() => resetActor(profileId)}
      >
        <Text>현재 Profile 환경 재설정</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="이전 원본 등록 완료"
        accessibilityRole="button"
        onPress={completePending}
      >
        <Text>이전 원본 등록 완료</Text>
      </Pressable>
    </>
  );
}

function ProfileMigrationSourceStoryContents({
  editable,
  profileId,
}: {
  editable: boolean;
  profileId: string;
}) {
  const data = useLazyLoadQuery<ProfileMigrationSourceControlStoriesQuery>(
    query,
    { id: profileId },
    { fetchPolicy: 'store-only' },
  );
  const profile = data.node?.profile;
  if (!profile) {
    return <Text>Profile fixture를 불러오지 못했어요.</Text>;
  }
  return <ProfileMigrationSourceControl editable={editable} profile={profile} />;
}

const meta = {
  args: { onMutationAttempt: fn() },
  component: ProfileMigrationSourceStory,
  excludeStories: [
    'DestinationAddressUnavailable',
    'FailureAndRetry',
    'LateCompletionIgnoredAfterActorLifecycleReset',
    'OwnerPreparationAndSuccess',
    'OwnerUnregistersPreparedSource',
  ],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Profile Migration Source Control',
} satisfies Meta<typeof ProfileMigrationSourceStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <ProfileMigrationSourceStory {...args} />,
};

export const OwnerWithPreparedSource: Story = {
  render: (args) => (
    <ProfileMigrationSourceStory {...args} editable initialSource={preparedSource} />
  ),
};

export const MemberReadOnly: Story = {
  render: (args) => <ProfileMigrationSourceStory {...args} editable={false} />,
};

export const OwnerPreparationAndSuccess: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '기존 계정 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '기존 계정 등록' }));
    await expect(canvas.findByText('이전 원본을 등록했어요')).resolves.toBeVisible();
    await expect(
      canvas.findByText('이제 기존 서비스의 계정에서 이 Kosmo 프로필로 Move를 시작하세요.'),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('group', {
        name: '이전받을 Kosmo 프로필 현재 Profile @target@selected-profile.example',
      }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole('group', {
        name: '현재 등록된 원본 원격 원본 Profile @source@remote.example',
      }),
    ).resolves.toBeVisible();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable />,
};

export const OwnerUnregistersPreparedSource: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const source = canvas.getByRole('group', {
      name: '현재 등록된 원본 원격 원본 Profile @source@remote.example',
    });
    expect(source).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '기존 계정 등록 해제' }));
    await expect(canvas.findByRole('textbox', { name: '기존 계정 주소' })).resolves.toBeVisible();
    await expect(canvas.findByRole('button', { name: '기존 계정 등록' })).resolves.toBeDisabled();
    expect(
      canvas.queryByText(
        '등록 해제 후 남은 팔로워 이전은 중단될 수 있어요. 이미 이전된 팔로워는 그대로 유지돼요.',
      ),
    ).toBeNull();
    expect(canvas.queryByRole('group', { name: /현재 등록된 원본/ })).toBeNull();
  },
  render: (args) => (
    <ProfileMigrationSourceStory {...args} editable initialSource={preparedSource} />
  ),
};

export const FailureAndRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '기존 계정 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '기존 계정 등록' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '이전 원본을 등록하지 못했어요.',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('이전 원본을 등록했어요')).resolves.toBeVisible();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable mode="error-once" />,
};

export const LateCompletionIgnoredAfterActorLifecycleReset: Story = {
  play: async ({ args, canvasElement }) => {
    args.onMutationAttempt.mockClear();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '기존 계정 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '기존 계정 등록' }));
    expect(args.onMutationAttempt).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: '현재 Profile 환경 재설정' }));
    await expect(canvas.getByRole('textbox', { name: '기존 계정 주소' })).toHaveValue('');
    await userEvent.click(canvas.getByRole('button', { name: '이전 원본 등록 완료' }));
    expect(canvas.queryByText('이전 원본을 등록했어요')).toBeNull();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable mode="pending" />,
};

export const DestinationAddressUnavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('group', { name: '이전받을 Kosmo 프로필 현재 Profile' }),
    ).resolves.toBeVisible();
    await expect(canvas.findByText('주소를 확인할 수 없어요.')).resolves.toBeVisible();
    await expect(canvas.findByRole('textbox', { name: '기존 계정 주소' })).resolves.toBeVisible();
    await expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeDisabled();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable targetCanonicalOrigin={null} />,
};

const longSourceReflowPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement);
  const control = canvas.getByTestId('profile-migration-source-control');
  const input = canvas.getByRole('textbox', { name: '기존 계정 주소' });
  const longHandle = longPreparedSource.relativeHandle;

  expect(input).toBeVisible();
  expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeVisible();
  await userEvent.type(input, longHandle);
  expect(canvas.getByRole('button', { name: '기존 계정 등록' })).toBeEnabled();
  expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
  expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);

  await userEvent.click(canvas.getByRole('button', { name: '기존 계정 등록' }));
  const source = await canvas.findByRole('group', { name: /현재 등록된 원본/ });
  expect(source).toBeVisible();
  expect(within(source).getByText(longPreparedSource.displayName)).toBeVisible();
  expect(within(source).getByText(longHandle)).toBeVisible();
  expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
  expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
};

const longSourceReflowParameters = {
  parameters: {
    viewport: {
      options: {
        profileMigrationNarrow: {
          name: 'Profile migration narrow mobile',
          styles: { height: '844px', width: '240px' },
          type: 'mobile',
        },
        profileMigrationWide: {
          name: 'Profile migration wide web',
          styles: { height: '900px', width: '1400px' },
          type: 'desktop',
        },
      },
    },
  },
} as const;

export const LongSourceReflowAtNarrowMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'profileMigrationNarrow' } },
  ...longSourceReflowParameters,
  play: longSourceReflowPlay,
  render: (args) => (
    <ProfileMigrationSourceStory {...args} editable sourceFixture={longPreparedSource} />
  ),
};

export const LongSourceReflowAtWideWeb: Story = {
  globals: { viewport: { isRotated: false, value: 'profileMigrationWide' } },
  ...longSourceReflowParameters,
  play: longSourceReflowPlay,
  render: (args) => (
    <ProfileMigrationSourceStory {...args} editable sourceFixture={longPreparedSource} />
  ),
};
