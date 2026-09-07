import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
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
        displayName
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
    return {
      displayName: node.displayName,
      followButton: node.followButton,
      hero: node.hero,
      id: node.id,
    };
  });
}

function requireProfile(profiles: ReturnType<typeof useStoryProfiles>, id: string) {
  const result = profiles.find((profileNode) => profileNode.id === id);
  if (!result) {
    throw new Error(`Missing ProfileHero profile fixture: ${id}.`);
  }
  return result;
}

type BlockFeedback = { blocked: boolean; status: 'success' | 'error' };
const focusProps = Platform.OS === 'web' ? { tabIndex: -1 as const } : { focusable: true };

export function ProfileHeroFixture({
  actionSize,
  containerWidth = 600,
  loading = false,
  profileId = defaultProfile.id,
  showAction = true,
  muted = false,
  onUnmute,
  onMute,
  initialBlocked = false,
  onBlock,
  onBlockFeedback,
  onBlockDismiss,
  onUnblock = async () => {},
  outcome = 'success',
}: {
  actionSize?: 'compact' | 'medium';
  containerWidth?: number;
  loading?: boolean;
  profileId?: string;
  showAction?: boolean;
  muted?: boolean;
  onUnmute?: () => Promise<void>;
  onMute?: () => Promise<void>;
  initialBlocked?: boolean;
  onBlock: () => Promise<void>;
  onBlockFeedback: (feedback: BlockFeedback) => void;
  onBlockDismiss?: () => void;
  onUnblock?: () => Promise<void>;
  outcome?: 'success' | 'error' | 'pending';
}) {
  const [isMuted, setMuted] = useState(muted);
  const [isBlocked, setBlocked] = useState(initialBlocked);
  const profileHeroSurfaceRef = useRef<View>(null);
  const focusAfterBlock = useRef(false);
  useEffect(() => {
    setMuted(muted);
    setBlocked(initialBlocked);
  }, [initialBlocked, muted, outcome, profileId]);
  useEffect(() => {
    if (focusAfterBlock.current) {
      profileHeroSurfaceRef.current?.focus();
      focusAfterBlock.current = false;
    }
  }, [isBlocked]);
  const profiles = useStoryProfiles();
  const target = requireProfile(profiles, profileId);

  const changeBlocked = async (nextBlocked: boolean) => {
    await (nextBlocked ? onBlock() : onUnblock());
    if (outcome === 'pending') {
      await new Promise<void>(() => {});
    }
    if (outcome === 'error') {
      throw new Error('요청 실패');
    }
  };
  const handleBlockFeedback = (feedback: BlockFeedback) => {
    onBlockFeedback(feedback);
    if (feedback.status === 'success') {
      focusAfterBlock.current = true;
      setBlocked(feedback.blocked);
    }
  };

  return (
    <SessionProvider>
      <View
        ref={profileHeroSurfaceRef}
        {...focusProps}
        style={{ maxWidth: '100%', width: containerWidth }}
        testID="profile-hero-surface"
      >
        <ProfileHero
          action={
            isBlocked ? (
              <ProfileBlockAction
                blocked
                displayName={target.displayName}
                onChangeBlocked={changeBlocked}
                onFeedback={handleBlockFeedback}
                onDismiss={onBlockDismiss}
                profileId={target.id}
                size={actionSize ?? 'medium'}
                surface="button"
              />
            ) : showAction ? (
              <FollowButton profile={target.followButton} size={actionSize} />
            ) : undefined
          }
          block={
            isBlocked
              ? {
                  blocked: true,
                  onUnblock: () => changeBlocked(false),
                  onDismiss: onBlockDismiss,
                  onFeedback: handleBlockFeedback,
                }
              : showAction
                ? {
                    onBlock: () => changeBlocked(true),
                    onFeedback: handleBlockFeedback,
                    onDismiss: onBlockDismiss,
                  }
                : undefined
          }
          loading={loading}
          mute={
            !isBlocked && showAction && onUnmute && onMute
              ? {
                  muted: isMuted,
                  onChangeMuted: async (nextMuted) => {
                    await (nextMuted ? onMute() : onUnmute());
                    if (outcome === 'pending') {
                      await new Promise<void>(() => {});
                    }
                    if (outcome === 'error') {
                      throw new Error('요청 실패');
                    }
                  },
                  onFeedback: (feedback) => {
                    if (feedback.status === 'success') {
                      setMuted(feedback.muted);
                    }
                  },
                }
              : undefined
          }
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

const meta = {
  excludeStories: ['ProfileHeroFixture'],
  args: {
    actionSize: undefined,
    containerWidth: 600,
    initialBlocked: false,
    loading: false,
    muted: false,
    onUnmute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onMute: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onBlock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    onBlockFeedback: fn(),
    onBlockDismiss: fn(),
    onUnblock: fn<() => Promise<void>>().mockResolvedValue(undefined),
    outcome: 'success',
    profileId: defaultProfile.id,
    showAction: true,
  },
  argTypes: {
    actionSize: { control: 'inline-radio', options: ['compact', 'medium'] },
    containerWidth: { control: 'inline-radio', options: [390, 600] },
    initialBlocked: { control: 'boolean' },
    loading: { control: 'boolean' },
    muted: { control: 'boolean' },
    outcome: { control: 'inline-radio', options: ['success', 'error', 'pending'] },
    profileId: { control: 'select', options: storyProfileIds },
    showAction: { control: 'boolean' },
  },
  component: ProfileHeroFixture,
  parameters: {
    docs: {
      description: {
        component:
          '메뉴·확인 동작을 검증하는 ProfileHero 패턴입니다. 차단 후에도 프로필 정보는 유지되고, Follow action은 차단 해제 action으로 바뀝니다. 화면 단위 흐름은 Screens/Profile Block에서 검토합니다.',
      },
    },
    layout: 'centered',
    relay: {
      data: {
        currentSession: { id: 'profile-hero-session', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
  },
  title: 'KOSMO/Patterns/ProfileHero',
} satisfies Meta<typeof ProfileHeroFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { actionSize: 'medium', initialBlocked: false },
  parameters: {
    controls: {
      disable: false,
      include: [
        'profileId',
        'initialBlocked',
        'muted',
        'outcome',
        'loading',
        'showAction',
        'actionSize',
        'containerWidth',
      ],
    },
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true }, layout: 'padded' },
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

export const Muted: Story = {
  args: { muted: true },
  globals: { viewport: { value: 'kosmoProfileFull', isRotated: false } },
};
