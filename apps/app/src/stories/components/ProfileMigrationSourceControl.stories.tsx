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
import { expect, fn, userEvent, within } from 'storybook/test';
import { ProfileMigrationSourceControl } from '@/components/profile/ProfileMigrationSourceControl';
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
  targetId,
}: {
  initialSource: typeof preparedSource | null;
  mode: Mode;
  onMutationAttempt: (attempt: number) => void;
  onPending: (complete: () => void) => void;
  sourceFixture: typeof preparedSource;
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
              sink.next({ data: preparePayload(targetId, variables, sourceFixture) });
              sink.complete();
            });
          });
        }
        if (mode === 'error-once' && attempts === 1) {
          return Promise.reject(new Error('profile migration preparation failed'));
        }
        return Promise.resolve({
          data: preparePayload(targetId, variables, sourceFixture),
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
        id: targetId,
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
) {
  const input = variables.input as { sourceHandle: string };
  return {
    prepareProfileMigration: {
      profile: {
        __typename: 'Profile',
        displayName: '현재 Profile',
        id: targetId,
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
}: {
  editable?: boolean;
  initialSource?: typeof preparedSource | null;
  mode?: Mode;
  onMutationAttempt: () => void;
  sourceFixture?: typeof preparedSource;
}) {
  const [revision, setRevision] = useState(0);
  const pendingCompletionRef = useRef<(() => void) | null>(null);
  const environment = useMemo(
    () =>
      createEnvironment({
        initialSource,
        mode,
        onMutationAttempt,
        onPending: (complete) => {
          pendingCompletionRef.current = complete;
        },
        sourceFixture,
        targetId: `${profileId}:${revision}`,
      }),
    [initialSource, mode, onMutationAttempt, revision, sourceFixture],
  );

  return (
    <View>
      <RelayEnvironmentProvider environment={environment}>
        <ProfileMigrationSourceStoryContents editable={editable} revision={revision} />
      </RelayEnvironmentProvider>
      {mode === 'pending' ? (
        <Pressable
          accessibilityLabel="Profile과 Environment 전환"
          accessibilityRole="button"
          onPress={() => setRevision((value) => value + 1)}
        >
          <Text>Profile과 Environment 전환</Text>
        </Pressable>
      ) : null}
      {mode === 'pending' ? (
        <Pressable
          accessibilityLabel="이전 준비 완료"
          accessibilityRole="button"
          onPress={() => pendingCompletionRef.current?.()}
        >
          <Text>이전 준비 완료</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfileMigrationSourceStoryContents({
  editable,
  revision,
}: {
  editable: boolean;
  revision: number;
}) {
  const data = useLazyLoadQuery<ProfileMigrationSourceControlStoriesQuery>(
    query,
    { id: `${profileId}:${revision}` },
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
    'FailureAndRetry',
    'LateCompletionIgnoredAfterEnvironmentTransition',
    'OwnerPreparationAndSuccess',
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
      canvas.getByRole('textbox', { name: '이전할 프로필 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '원본 프로필 준비' }));
    await expect(canvas.findByText('원본 프로필을 준비했어요.')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('group', {
        name: '현재 준비된 원본 원격 원본 Profile @source@remote.example',
      }),
    ).resolves.toBeVisible();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable />,
};

export const FailureAndRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '이전할 프로필 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '원본 프로필 준비' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '원본 프로필을 준비하지 못했어요.',
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('원본 프로필을 준비했어요.')).resolves.toBeVisible();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable mode="error-once" />,
};

export const LateCompletionIgnoredAfterEnvironmentTransition: Story = {
  play: async ({ args, canvasElement }) => {
    args.onMutationAttempt.mockClear();
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '이전할 프로필 주소' }),
      '@source@remote.example',
    );
    await userEvent.click(canvas.getByRole('button', { name: '원본 프로필 준비' }));
    expect(args.onMutationAttempt).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Profile과 Environment 전환' }));
    await userEvent.click(canvas.getByRole('button', { name: '이전 준비 완료' }));
    expect(canvas.queryByText('원본 프로필을 준비했어요.')).toBeNull();
  },
  render: (args) => <ProfileMigrationSourceStory {...args} editable mode="pending" />,
};

const longSourceReflowPlay = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const canvas = within(canvasElement);
  const control = canvas.getByTestId('profile-migration-source-control');
  const input = canvas.getByRole('textbox', { name: '이전할 프로필 주소' });
  const longHandle = longPreparedSource.relativeHandle;

  expect(input).toBeVisible();
  expect(canvas.getByRole('button', { name: '원본 프로필 준비' })).toBeVisible();
  await userEvent.type(input, longHandle);
  expect(canvas.getByRole('button', { name: '원본 프로필 준비' })).toBeEnabled();
  expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
  expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);

  await userEvent.click(canvas.getByRole('button', { name: '원본 프로필 준비' }));
  const source = await canvas.findByRole('group', { name: /현재 준비된 원본/ });
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
