import { graphql, useFragment } from 'react-relay';
import { PostComposer } from '@/components/post/PostComposer';
import type { RightRail_profile$key } from './__generated__/RightRail_profile.graphql';

const RightRailFragment = graphql`
  fragment RightRail_profile on Profile {
    ...PostComposer_profile
  }
`;

export function RightRail({ profile: profileKey }: { profile: RightRail_profile$key }) {
  const profile = useFragment(RightRailFragment, profileKey);
  return <PostComposer profile={profile} />;
}
