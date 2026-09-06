import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { profile } from '../fixtures';
import { Catalog, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileNameBlockStoriesQuery as ProfileNameBlockStoriesQueryType } from './__generated__/ProfileNameBlockStoriesQuery.graphql';

const localProfile = profile({
  displayName: '코스모 작가',
  handle: 'kosmo',
  id: 'profile-name-block-local',
  relativeHandle: '@kosmo',
});
const remoteProfile = profile({
  displayName: '먼 인스턴스의 작가',
  handle: 'remote-user',
  id: 'profile-name-block-remote',
  instance: { kind: 'ACTIVITYPUB' },
  relativeHandle: '@remote-user@space.example',
});
const longProfile = profile({
  displayName: '아주 긴 표시 이름을 가진 프로필 작성자',
  handle: 'long-profile-name',
  id: 'profile-name-block-long',
  relativeHandle: '@long-profile-name@very-long-instance.example',
});

const storyProfiles = [localProfile, remoteProfile, longProfile];
const storyProfileIds = storyProfiles.map(({ id }) => id);

const ProfileNameBlockStoriesQuery = graphql`
  query ProfileNameBlockStoriesQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        ...ProfileNameBlock_profile @alias(as: "nameBlock")
      }
    }
  }
`;

function useStoryProfiles() {
  const data = useLazyLoadQuery<ProfileNameBlockStoriesQueryType>(ProfileNameBlockStoriesQuery, {
    ids: storyProfileIds,
  });

  return data.nodes.map((node) => {
    if (node?.__typename !== 'Profile' || !node.nameBlock) {
      throw new Error(
        'ProfileNameBlockStoriesQuery must return Profile fragments in fixture order.',
      );
    }

    const fixture = storyProfiles.find(({ id }) => id === node.id);
    if (!fixture) {
      throw new Error(
        'ProfileNameBlockStoriesQuery must return Profile fragments in fixture order.',
      );
    }

    return { id: node.id, nameBlock: node.nameBlock, relativeHandle: fixture.relativeHandle };
  });
}

function requireProfile(profiles: ReturnType<typeof useStoryProfiles>, id: string) {
  const result = profiles.find((profileNode) => profileNode.id === id);
  if (!result) {
    throw new Error(`Missing ProfileNameBlock profile fixture: ${id}.`);
  }
  return result;
}

function ProfileNameBlockFixture({
  containerWidth = 240,
  linked = false,
  profileId = localProfile.id,
  variant = 'default',
}: {
  containerWidth?: number;
  linked?: boolean;
  profileId?: string;
  variant?: 'compact' | 'default' | 'hero';
}) {
  const profileNode = requireProfile(useStoryProfiles(), profileId);

  return (
    <Catalog width={containerWidth}>
      {variant === 'hero' ? (
        <ProfileNameBlock profile={profileNode.nameBlock} style={{ flex: 0 }} variant="hero" />
      ) : (
        <ProfileNameBlock
          href={linked ? `/${profileNode.relativeHandle}` : undefined}
          profile={profileNode.nameBlock}
          variant={variant}
        />
      )}
    </Catalog>
  );
}

function ProfileNameBlockCatalog() {
  const profiles = useStoryProfiles();
  const remote = requireProfile(profiles, remoteProfile.id);
  const long = requireProfile(profiles, longProfile.id);

  return (
    <Catalog>
      <Section title="Remote and long names">
        <View style={{ width: 240 }}>
          <ProfileNameBlock
            href={`/${remote.relativeHandle}`}
            profile={remote.nameBlock}
            variant="compact"
          />
        </View>
        <View style={{ width: 240 }}>
          <ProfileNameBlock profile={long.nameBlock} style={{ flex: 0 }} variant="hero" />
        </View>
      </Section>
    </Catalog>
  );
}

const meta = {
  args: {
    containerWidth: 240,
    linked: false,
    profileId: localProfile.id,
    variant: 'default',
  },
  argTypes: {
    containerWidth: { control: 'inline-radio', options: [120, 240, 360] },
    linked: { control: 'boolean', if: { arg: 'variant', neq: 'hero' } },
    profileId: { control: 'select', options: storyProfileIds },
    variant: { control: 'select', options: ['default', 'compact', 'hero'] },
  },
  component: ProfileNameBlockFixture,
  parameters: {
    relay: {
      data: {
        currentSession: {
          id: 'profile-name-block-session',
          selectedProfile: { id: 'profile-viewer' },
        },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: storyProfiles,
      },
    },
    router: { pathname: '/home' },
  },
  title: 'KOSMO/Components/ProfileNameBlock',
} satisfies Meta<typeof ProfileNameBlockFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['profileId', 'variant', 'linked', 'containerWidth'],
    },
  },
};

export const RepresentativeStates: Story = {
  parameters: { controls: { disable: true } },
  render: () => <ProfileNameBlockCatalog />,
};
