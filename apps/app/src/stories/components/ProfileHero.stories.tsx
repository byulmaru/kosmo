import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, within } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { SessionProvider } from '@/session/SessionProvider';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import ogDefaultUrl from '../../../public/og-default.png?url';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileHeroStoriesQuery as ProfileHeroStoriesQueryType } from './__generated__/ProfileHeroStoriesQuery.graphql';

const defaultProfile = profile({
  avatar: { id: 'profile-hero-avatar', url: '/profile-hero-avatar.png' },
  displayName: '프로필 히어로',
  id: 'profile-hero-default',
  relativeHandle: '@profile-hero',
});
const imageProfile = profile({
  avatar: { id: 'profile-hero-image-avatar', url: appleTouchIconUrl },
  displayName: '이미지 프로필',
  header: { id: 'profile-hero-image-header', url: ogDefaultUrl },
  id: 'profile-hero-images',
  relativeHandle: '@images',
});
const taggedProfile = profile({
  displayName: '태그 프로필',
  id: 'profile-hero-tags',
  relativeHandle: '@tags',
  tags: [
    { id: 'hashtag-fediverse', name: 'Fediverse' },
    { id: 'hashtag-development', name: '개발' },
  ],
});
const longTaggedProfile = profile({
  displayName: '긴 태그 프로필',
  id: 'profile-hero-long-tags',
  relativeHandle: '@long-tags',
  tags: [
    { id: 'hashtag-craft', name: '공예' },
    { id: 'hashtag-photography', name: '사진' },
    { id: 'hashtag-reading', name: '독서' },
    { id: 'hashtag-music', name: '음악' },
    { id: 'hashtag-long', name: '아주긴프로필태그이름입니다' },
    { id: 'hashtag-max-length', name: '가'.repeat(20) },
  ],
});
const noBioProfile = profile({
  bio: null,
  displayName: '소개 없는 히어로',
  id: 'profile-hero-no-bio',
  relativeHandle: '@no-bio',
});

const storyProfiles = [
  defaultProfile,
  imageProfile,
  taggedProfile,
  longTaggedProfile,
  noBioProfile,
];
const storyProfileIds = storyProfiles.map(({ id }) => id);

const ProfileHeroStoriesQuery = graphql`
  query ProfileHeroStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...FollowButton_profile @alias(as: "followButton")
        ...ProfileHero_profile @alias(as: "hero")
      }
    }
  }
`;

function useStoryProfiles() {
  const data = useLazyLoadQuery<ProfileHeroStoriesQueryType>(ProfileHeroStoriesQuery, {
    ids: storyProfileIds,
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.hero || !node.followButton) {
      throw new Error('ProfileHeroStoriesQuery must return Profile fragments in fixture order.');
    }
    return { followButton: node.followButton, hero: node.hero, id: node.id };
  });
}

function requireProfile(profiles: ReturnType<typeof useStoryProfiles>, id: string) {
  const result = profiles.find((profileNode) => profileNode.id === id);
  if (!result) {
    throw new Error(`Missing ProfileHero profile fixture: ${id}.`);
  }
  return result;
}

function ProfileHeroFixture({
  actionSize,
  containerWidth = 600,
  loading = false,
  profileId = defaultProfile.id,
  showAction = true,
}: {
  actionSize?: 'compact' | 'medium';
  containerWidth?: number;
  loading?: boolean;
  profileId?: string;
  showAction?: boolean;
}) {
  const profiles = useStoryProfiles();
  const target = requireProfile(profiles, profileId);

  return (
    <SessionProvider>
      <View style={{ width: containerWidth }}>
        <ProfileHero
          action={
            showAction ? (
              <FollowButton profile={target.followButton} size={actionSize} />
            ) : undefined
          }
          loading={loading}
          profile={target.hero}
        />
      </View>
    </SessionProvider>
  );
}

function ProfileHeroCatalog() {
  const profiles = useStoryProfiles();

  return (
    <Catalog>
      <Section title="Profile content">
        <ProfileHero profile={requireProfile(profiles, defaultProfile.id).hero} />
        <ProfileHero profile={requireProfile(profiles, noBioProfile.id).hero} />
      </Section>
      <Section title="Images and tags">
        <ProfileHero profile={requireProfile(profiles, imageProfile.id).hero} />
        <ProfileHero profile={requireProfile(profiles, taggedProfile.id).hero} />
      </Section>
      <Section title="Loading">
        <ProfileHero loading />
      </Section>
    </Catalog>
  );
}

const maxLengthTag = '가'.repeat(20);

const meta = {
  args: {
    actionSize: undefined,
    containerWidth: 600,
    loading: false,
    profileId: defaultProfile.id,
    showAction: true,
  },
  argTypes: {
    actionSize: { control: 'inline-radio', options: ['compact', 'medium'] },
    containerWidth: { control: 'inline-radio', options: [390, 600] },
    loading: { control: 'boolean' },
    profileId: { control: 'select', options: storyProfileIds },
    showAction: { control: 'boolean' },
  },
  component: ProfileHeroFixture,
  excludeStories: [
    'CenterGeometryContract',
    'ImageAndTagsContract',
    'LoadingGeometryContract',
    'MobileGeometryContract',
  ],
  parameters: {
    layout: 'centered',
    relay: {
      data: {
        currentSession: { id: 'profile-hero-session', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
  },
  title: 'KOSMO/Components/ProfileHero',
} satisfies Meta<typeof ProfileHeroFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { actionSize: 'medium' },
  parameters: {
    controls: {
      disable: false,
      include: ['profileId', 'loading', 'showAction', 'actionSize', 'containerWidth'],
    },
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <SessionProvider>
      <ProfileHeroCatalog />
    </SessionProvider>
  ),
};

export const Center: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { layout: 'centered' },
};

export const Mobile: Story = {
  args: { containerWidth: 390 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'centered' },
};

export const ImagesAndTags: Story = {
  args: { profileId: imageProfile.id, showAction: false },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { layout: 'centered' },
};

export const Loading: Story = {
  args: { actionSize: 'medium', loading: true, showAction: true },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { layout: 'centered' },
};

export const CenterGeometryContract: Story = {
  args: { actionSize: 'medium' },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(40);
    expect(followButton.getBoundingClientRect().width).toBe(96);
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
    expect(canvas.getByRole('link', { name: /팔로잉/ })).toHaveAttribute(
      'href',
      '/@profile-hero/following',
    );
    expect(canvas.getByRole('link', { name: /팔로워/ })).toHaveAttribute(
      'href',
      '/@profile-hero/followers',
    );
  },
};

export const MobileGeometryContract: Story = {
  args: { actionSize: 'compact' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(32);
    expect(followButton.getBoundingClientRect().width).toBe(72);
    expect(canvas.getByLabelText('프로필 히어로 프로필 이미지')).toBeVisible();
  },
};

export const LoadingGeometryContract: Story = {
  args: { actionSize: 'medium', loading: true, showAction: true },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(40);
    expect(followButton.getBoundingClientRect().width).toBe(96);
    expect(canvas.getByText('프로필을 불러오는 중입니다.')).toBeInTheDocument();
  },
};

export const ImageAndTagsContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  render: () => (
    <ProfileHeroFixture containerWidth={240} profileId={longTaggedProfile.id} showAction={false} />
  ),
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('#공예')).toBeInTheDocument();
    expect(canvas.getByText('#사진')).toBeInTheDocument();
    expect(canvas.getByText('#아주긴프로필태그이름입니다')).toBeInTheDocument();
    expect(canvas.getByText(`#${maxLengthTag}`)).toBeInTheDocument();
    const tagList = canvas.getByTestId('profile-tag-list');
    const chips = within(tagList).getAllByTestId('profile-tag-chip');
    expect(chips).toHaveLength(longTaggedProfile.tags.length);
    expect(
      new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
    ).toBeGreaterThan(1);
    expect(tagList.scrollWidth).toBeLessThanOrEqual(tagList.clientWidth + 1);
    const maxLengthText = within(tagList).getByText(`#${maxLengthTag}`);
    const maxLengthLink = within(tagList).getByRole('link', {
      name: `#${maxLengthTag} 관련 프로필 보기`,
    });
    expect(maxLengthLink.getBoundingClientRect().height).toBe(32);
    expect(maxLengthLink.getBoundingClientRect().width).toBeGreaterThanOrEqual(32);
    expect(getComputedStyle(maxLengthText).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(maxLengthText).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(maxLengthText).overflow).toBe('hidden');
    expect(maxLengthText.scrollWidth).toBeGreaterThan(maxLengthText.clientWidth);
    for (const chip of chips) {
      expect(chip.getBoundingClientRect().height).toBe(32);
      expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(
        tagList.getBoundingClientRect().right + 1,
      );
    }
    expect(canvas.getByRole('link', { name: '#공예 관련 프로필 보기' })).toHaveAttribute(
      'href',
      '/hashtags/[hashtagId]/profiles',
    );
  },
};
