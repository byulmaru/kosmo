import { expect, userEvent, within } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileConnectionList } from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { followersProfile, followingProfile, profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const followable = profile({ id: 'profile-followable' });
const followed = profile({
  id: 'profile-followed',
  viewerState: { follow: { id: 'follow-story' }, isSelf: false },
});
const self = profile({
  displayName: '내 프로필',
  id: 'profile-self',
  viewerState: { follow: null, isSelf: true },
});
const remote = profile({
  bio: '먼 인스턴스에서 온 아주 긴 한 줄 소개가 컨테이너 폭을 넘겨도 레이아웃은 유지됩니다.',
  displayName: '아주 긴 표시 이름을 가진 먼 우주의 사용자',
  handle: 'remote-user',
  id: 'profile-remote',
  relativeHandle: '@remote-user@very-long-instance.example',
});

function ProfileCatalog() {
  return (
    <Catalog>
      <Section title="Name blocks · local / remote">
        <ProfileNameBlock profile={followable as never} />
        <ProfileNameBlock profile={remote as never} />
      </Section>

      <Section title="Hero · default / no bio / remote / loading">
        <ProfileHero
          action={<FollowButton profile={followable as never} />}
          profile={followable as never}
        />
        <ProfileHero profile={profile({ bio: null, id: 'profile-no-bio' }) as never} />
        <ProfileHero profile={remote as never} />
        <ProfileHero loading />
      </Section>
    </Catalog>
  );
}

const meta = {
  component: ProfileCatalog,
  parameters: { router: { pathname: '/@kosmo' } },
  title: 'KOSMO/Profiles/Profile',
} satisfies Meta<typeof ProfileCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeroNameAndLoadingStates: Story = {};

export const ListAndFollowStates: Story = {
  render: () => (
    <Catalog>
      <Section title="Followable">
        <ProfileListItem linked profile={followable as never} />
      </Section>
      <Section title="Following">
        <ProfileListItem linked profile={followed as never} />
      </Section>
      <Section title="No viewer state · action hidden">
        <ProfileListItem
          profile={profile({ id: 'profile-no-viewer', viewerState: null }) as never}
        />
      </Section>
      <Section title="Self · action hidden">
        <ProfileListItem profile={self as never} />
      </Section>
      <Section title="Long remote content">
        <ProfileListItem linked profile={remote as never} />
      </Section>
    </Catalog>
  ),
};

export const FollowSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => <FollowButton profile={followable as never} />,
};

export const FollowErrorInteraction: Story = {
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로우 상태를 변경하지 못했습니다.',
    );
  },
  render: () => <FollowButton profile={followable as never} />,
};

export const ConnectionLoadingErrorEmptyAndContent: Story = {
  render: () => (
    <Catalog>
      <Section title="Followers · empty">
        <ProfileConnectionList kind="followers" profile={followersProfile([]) as never} />
      </Section>
      <Section title="Followers · content and more">
        <ProfileConnectionList
          kind="followers"
          profile={followersProfile([followable, followed], { hasNext: true }) as never}
        />
      </Section>
      <Section title="Following · empty">
        <ProfileConnectionList kind="following" profile={followingProfile([]) as never} />
      </Section>
      <Section title="Following · content and last page">
        <ProfileConnectionList
          kind="following"
          profile={followingProfile([remote], { hasNext: false }) as never}
        />
      </Section>
    </Catalog>
  ),
};

export const ConnectionNextPageErrorInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '팔로워를 더 불러오지 못했어요',
    );
  },
  render: () => (
    <Catalog>
      <ProfileConnectionList
        kind="followers"
        profile={
          followersProfile([followable, followed], {
            hasNext: true,
            nextPageError: true,
          }) as never
        }
      />
    </Catalog>
  ),
};
