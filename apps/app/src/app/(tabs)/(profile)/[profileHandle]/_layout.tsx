import { Slot } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { useProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { ReactNode } from 'react';
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
    <RouteBoundary
      key={handle}
      loading={
        <ProfileRouteContainer>
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      onRetry={() => setFetchKey((key) => key + 1)}
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent fetchKey={`${revision}:${fetchKey}`} handle={handle} />
    </RouteBoundary>
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
    <ProfileRouteContainer>
      <ProfileHero action={<FollowButton profile={profile} />} profile={profile} />
      <Slot />
    </ProfileRouteContainer>
  );
}

function ProfileRouteContainer({ children }: { children: ReactNode }) {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : (
    <ScrollView style={styles.nativeRoot}>{children}</ScrollView>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
