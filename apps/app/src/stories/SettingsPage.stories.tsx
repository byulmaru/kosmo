import { Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { profile } from './fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SettingsPageStoriesQuery } from './__generated__/SettingsPageStoriesQuery.graphql';

const owner = profile({
  defaultPostVisibility: 'UNLISTED',
  displayName: '설정 대상 Profile',
  id: 'profile-settings-owner',
  relativeHandle: '@settings-owner',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});

const query = graphql`
  query SettingsPageStoriesQuery($id: ID!) {
    node(id: $id) {
      ... on Profile {
        ...SettingsPage_profile @alias(as: "profile")
      }
    }
  }
`;

function AccountErrorFixture() {
  return (
    <View accessibilityRole="alert" testID="settings-account-error">
      <Text>Byulmaru ID 계정 설정을 열지 못했어요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Account 다시 시도">
        <Text>다시 시도</Text>
      </Pressable>
    </View>
  );
}

function SettingsPageStory({
  accountError = false,
  noProfile = false,
}: {
  accountError?: boolean;
  noProfile?: boolean;
}) {
  const data = useLazyLoadQuery<SettingsPageStoriesQuery>(query, { id: owner.id });

  return (
    <SettingsPage
      accountEntry={accountError ? <AccountErrorFixture /> : undefined}
      profile={noProfile ? null : (data.node?.profile ?? null)}
    />
  );
}

const meta = {
  component: SettingsPageStory,
  title: 'KOSMO/Settings/Settings Page',
} satisfies Meta<typeof SettingsPageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedProfile: Story = {
  parameters: { relay: { data: { node: owner } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '설정' })).toBeVisible();
    expect(
      canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정, 외부 서비스로 이동' }),
    ).toBeVisible();
    expect(canvas.getByText('설정 대상 Profile')).toBeVisible();
    expect(canvas.getByText('@settings-owner')).toBeVisible();
    expect(canvas.getAllByRole('radio')).toHaveLength(3);
  },
  render: () => <SettingsPageStory />,
};

export const NoSelectedProfile: Story = {
  parameters: { relay: { data: { node: owner } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole('link', { name: 'Byulmaru ID 계정 설정, 외부 서비스로 이동' }),
    ).toBeVisible();
    expect(canvas.getByText('프로필 설정이 없어요')).toBeVisible();
    expect(canvas.queryByRole('radio')).toBeNull();
  },
  render: () => <SettingsPageStory noProfile />,
};

export const AccountAndProfileErrorsRemainIndependent: Story = {
  parameters: {
    relay: {
      data: { node: owner },
      mutationError: 'settings failed',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toHaveTextContent('Byulmaru ID 계정 설정을 열지 못했어요.');
    await userEvent.click(canvas.getByRole('radio', { name: '팔로워만: 팔로워만 볼 수 있어요.' }));
    await userEvent.click(canvas.getByRole('button', { name: '기본 게시 공개 범위 저장' }));
    await expect(canvas.findByText('기본 공개 범위를 저장하지 못했어요.')).resolves.toBeTruthy();
    expect(canvas.getByText('설정 대상 Profile')).toBeVisible();
    expect(canvas.getByText('기본 공개 범위를 저장하지 못했어요.')).toBeVisible();
  },
  render: () => <SettingsPageStory accountError />,
};
