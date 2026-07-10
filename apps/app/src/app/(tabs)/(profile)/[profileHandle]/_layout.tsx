import { Slot } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfileRouteBoundary } from '@/components/profile/ProfileRouteBoundary';
import { useProfileHandle } from '@/components/profile/route';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      ...ProfileHero_profile
      ...FollowButton_profile
    }
  }
`;

export default function ProfileLayout() {
  const handle = useProfileHandle();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);

  return (
    <ProfileRouteBoundary
      key={handle}
      loading={
        <ScrollView style={styles.scroll}>
          <ProfileHero loading />
        </ScrollView>
      }
      onRetry={() => setFetchKey((key) => key + 1)}
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </ProfileRouteBoundary>
  );
}

function ProfileLayoutContent({ fetchKey, handle }: { fetchKey: string; handle: string }) {
  const data = useLazyLoadQuery<ProfileLayoutQueryType>(
    ProfileLayoutQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;

  if (!profile) {
    return (
      <StateView
        description={`@${handle} 프로필이 존재하지 않아요.`}
        title="프로필을 찾을 수 없어요"
      />
    );
  }

  return (
    <ScrollView style={styles.scroll}>
      <ProfileHero action={<FollowButton profile={profile} />} profile={profile} />
      <Slot />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ scroll: { flex: 1 } });
