import { Link, Slot, useGlobalSearchParams } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      ...ProfileHero_profile
      ...FollowButton_profile
    }
    selectedProfileForEdit {
      id
    }
  }
`;

export default function ProfileLayout() {
  const { profileHandle } = useGlobalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);
  return (
    <RouteBoundary
      key={handle}
      loading={
        <ProfileRouteContainer>
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent handle={handle} />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({ handle }: { handle: string }) {
  const { fetchKey } = useRouteBoundary();
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

  const action =
    data.selectedProfileForEdit?.id === profile.id ? (
      <Link asChild href={'/profile-edit' as Href}>
        <Button accessibilityLabel="프로필 편집" tone="secondary">
          편집
        </Button>
      </Link>
    ) : (
      <FollowButton profile={profile} />
    );

  return (
    <ProfileRouteContainer>
      <ProfileHero action={action} profile={profile} />
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
