import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { ReactionPeopleScreen } from '@/components/reaction/ReactionPeopleScreen';
import { profile } from '../fixtures';
import type { ReactionPeopleScreenProps } from '@/components/reaction/ReactionPeopleScreen';

export const peoplePostId = 'people-screen-post';
export const peopleCounts = ['❤️', '🎉', '🥹', '👀', '☘️', '🌈'].map((type) => ({
  count: 2,
  type,
}));
export const peopleProfiles = [
  profile({
    bio: 'People에서는 숨기는 실제 소개입니다.',
    displayName: '별빛 여행자',
    handle: 'people-starlight',
    id: 'people-starlight',
    relativeHandle: '@people-starlight',
  }),
  profile({
    displayName: '은하 기록자',
    handle: 'people-galaxy',
    id: 'people-galaxy',
    relativeHandle: '@people-galaxy',
  }),
];
export const otherPeopleProfiles = [
  profile({
    displayName: '축하하는 혜성',
    handle: 'people-comet',
    id: 'people-comet',
    relativeHandle: '@people-comet',
  }),
  profile({
    displayName: '축하하는 달',
    handle: 'people-moon',
    id: 'people-moon',
    relativeHandle: '@people-moon',
  }),
];

export function peopleQueryData(profiles = peopleProfiles, hasNextPage = false) {
  return {
    node: {
      __typename: 'Post' as const,
      id: peoplePostId,
      reactionProfiles: {
        edges: profiles.map((node) => ({ cursor: `people-cursor-${node.id}`, node })),
        pageInfo: {
          endCursor: profiles.length ? `people-cursor-${profiles.at(-1)!.id}` : null,
          hasNextPage,
        },
      },
    },
  };
}

export function ReactionPeopleExample(props: ReactionPeopleScreenProps) {
  const { height } = useWindowDimensions();
  const [reactionType, setReactionType] = useState(props.reactionType);

  return (
    <View style={{ alignSelf: 'center', maxWidth: 600, minHeight: height, width: '100%' }}>
      <ReactionPeopleScreen
        {...props}
        onTypeChange={(type) => {
          props.onTypeChange(type);
          setReactionType(type);
        }}
        reactionType={reactionType}
      />
    </View>
  );
}
