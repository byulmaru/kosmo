import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, within } from 'storybook/test';
import { ProfileListItem } from '@/components/profile/ProfileListItem';
import { SessionProvider } from '@/session/SessionProvider';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileListItemStoriesQuery as ProfileListItemStoriesQueryType } from './__generated__/ProfileListItemStoriesQuery.graphql';

const longBio =
  '우주와 사람을 잇는 코스모 프로필입니다. 서로 다른 행성과 인스턴스의 이야기를 천천히 나눠요.';
const withBio = profile({
  avatar: { id: 'profile-list-item-avatar', url: appleTouchIconUrl },
  bio: longBio,
  displayName: '긴 소개 프로필',
  id: 'profile-list-item-with-bio',
  relativeHandle: '@with-bio',
});
const following = profile({
  displayName: '팔로잉 프로필',
  id: 'profile-list-item-following',
  relativeHandle: '@following',
  viewerState: {
    follow: {
      follower: { followingCount: 42, id: 'profile-viewer' },
      id: 'profile-list-item-following-edge',
    },
    followRequest: null,
    isSelf: false,
  },
});
const noBio = profile({
  bio: null,
  displayName: '소개 없는 프로필',
  id: 'profile-list-item-no-bio',
  relativeHandle: '@no-bio',
});
const self = profile({
  displayName: '내 프로필',
  id: 'profile-list-item-self',
  relativeHandle: '@self',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});
const noViewer = profile({
  displayName: '상태 없는 프로필',
  id: 'profile-list-item-no-viewer',
  relativeHandle: '@no-viewer',
  viewerState: null,
});

const storyProfiles = [withBio, following, noBio, self, noViewer];
const storyProfileIds = storyProfiles.map(({ id }) => id);

const ProfileListItemStoriesQuery = graphql`
  query ProfileListItemStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...ProfileListItem_profile @alias(as: "listItem")
      }
    }
  }
`;

function useStoryProfiles() {
  const data = useLazyLoadQuery<ProfileListItemStoriesQueryType>(ProfileListItemStoriesQuery, {
    ids: storyProfileIds,
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.listItem) {
      throw new Error(
        'ProfileListItemStoriesQuery must return Profile fragments in fixture order.',
      );
    }
    return { id: node.id, listItem: node.listItem };
  });
}

function requireProfile(profiles: ReturnType<typeof useStoryProfiles>, id: string) {
  const result = profiles.find((profileNode) => profileNode.id === id);
  if (!result) {
    throw new Error(`Missing ProfileListItem profile fixture: ${id}.`);
  }
  return result;
}

function ProfileListItemFixture({
  linked = true,
  onPress,
  profileId = withBio.id,
}: {
  linked?: boolean;
  onPress?: () => void;
  profileId?: string;
}) {
  const profiles = useStoryProfiles();
  const target = requireProfile(profiles, profileId);

  return (
    <SessionProvider>
      <Catalog>
        <ProfileListItem linked={linked} onPress={onPress} profile={target.listItem} />
      </Catalog>
    </SessionProvider>
  );
}

function ProfileListItemCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Bio and compact action">
        <ProfileListItem linked profile={requireProfile(profiles, withBio.id).listItem} />
      </Section>
      <Section title="Following and no bio">
        <ProfileListItem linked profile={requireProfile(profiles, following.id).listItem} />
        <ProfileListItem profile={requireProfile(profiles, noBio.id).listItem} />
      </Section>
      <Section title="Self and unavailable viewer state">
        <ProfileListItem profile={requireProfile(profiles, self.id).listItem} />
        <ProfileListItem profile={requireProfile(profiles, noViewer.id).listItem} />
      </Section>
    </Catalog>
  );
}

const meta = {
  args: { linked: true, onPress: fn(), profileId: withBio.id },
  argTypes: {
    linked: { control: 'boolean' },
    onPress: { action: 'profilePress', control: false },
    profileId: { control: 'select', options: storyProfileIds },
  },
  component: ProfileListItemFixture,
  excludeStories: ['LayoutContract'],
  parameters: {
    layout: 'centered',
    relay: {
      data: {
        currentSession: {
          id: 'profile-list-item-session',
          selectedProfile: { id: 'profile-viewer' },
        },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
  },
  title: 'KOSMO/Components/ProfileListItem',
} satisfies Meta<typeof ProfileListItemFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['profileId', 'linked'] },
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <SessionProvider>
      <ProfileListItemCatalog />
    </SessionProvider>
  ),
};

export const LayoutContract: Story = {
  render: () => (
    <SessionProvider>
      <ProfileListItemCatalog />
    </SessionProvider>
  ),
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followButton = canvas.getAllByRole('button', { name: '팔로우' })[0]!;
    expect(followButton.getBoundingClientRect().height).toBe(32);
    expect(followButton.getBoundingClientRect().width).toBe(72);
    expect(getComputedStyle(canvas.getByText(longBio)).webkitLineClamp).toBe('3');
    const withBioAvatar = canvas.getByLabelText('긴 소개 프로필 프로필 이미지');
    expect(withBioAvatar).toBeVisible();
    expect(withBioAvatar.querySelector('img')).toHaveAttribute('src', appleTouchIconUrl);
    expect(canvasElement.querySelector('a[href="/@with-bio"]')).toBeInTheDocument();
    const fallbackAvatar = canvas.getByLabelText('상태 없는 프로필 프로필 이미지');
    expect(fallbackAvatar.querySelector('img')?.getAttribute('src')).toMatch(
      /\/assets\/avatar\/default-avatar\.png$/,
    );
  },
};
