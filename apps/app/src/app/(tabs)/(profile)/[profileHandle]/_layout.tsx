import { Slot, useGlobalSearchParams, usePathname } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfilePostListHeaderProvider } from '@/components/profile/ProfilePostListHeaderContext';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      instance {
        kind
      }
      viewerState {
        isSelf
        membership {
          role
        }
      }
      ...ProfileHero_profile
      ...FollowButton_profile
    }
  }
`;

export default function ProfileLayout() {
  const { profileHandle } = useGlobalSearchParams<{
    profileHandle?: string | string[];
  }>();
  const handle = normalizeProfileHandle(profileHandle);
  const pathname = usePathname();
  const isPostListRoute = !/\/(followers|following)$/.test(pathname);

  return (
    <RouteBoundary
      key={handle}
      loading={
        <ProfileRouteContainer scrollable>
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent handle={handle} isPostListRoute={isPostListRoute} />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({
  handle,
  isPostListRoute,
}: {
  handle: string;
  isPostListRoute: boolean;
}) {
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

  const canEdit =
    profile.instance.kind === 'LOCAL' &&
    profile.viewerState?.isSelf === true &&
    profile.viewerState.membership?.role === 'OWNER';
  const action = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : (
    <FollowButton profile={profile} />
  );

  const header = <ProfileHero action={action} profile={profile} />;

  if (!isPostListRoute || Platform.OS === 'web') {
    return (
      <ProfileRouteContainer scrollable={!isPostListRoute}>
        {header}
        <Slot />
      </ProfileRouteContainer>
    );
  }

  return (
    <ProfilePostListHeaderProvider header={header}>
      <ProfileRouteContainer scrollable={false}>
        <Slot />
      </ProfileRouteContainer>
    </ProfilePostListHeaderProvider>
  );
}

function ProfileRouteContainer({
  children,
  scrollable,
}: {
  children: ReactNode;
  scrollable: boolean;
}) {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : scrollable ? (
    <ScrollView style={styles.nativeRoot}>{children}</ScrollView>
  ) : (
    <View style={styles.nativeRoot}>{children}</View>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
