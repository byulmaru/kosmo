import { Slot, useGlobalSearchParams, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useSession } from '@/session/SessionProvider';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      displayName
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
  const scrollKey = pathname;

  return (
    <RouteBoundary
      key={handle}
      loading={
        <ProfileRouteContainer scrollKey={scrollKey}>
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent handle={handle} scrollKey={scrollKey} />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({ handle, scrollKey }: { handle: string; scrollKey: string }) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<ProfileLayoutQueryType>(
    ProfileLayoutQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;
  const { selectedProfileId } = useSession();

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
  const canMute = Boolean(selectedProfileId && profile.viewerState && !profile.viewerState.isSelf);
  const relationshipAction = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : (
    <FollowButton profile={profile} />
  );

  return (
    <ProfileRouteContainer scrollKey={scrollKey}>
      <ProfileHero
        key={selectedProfileId}
        action={relationshipAction}
        profile={profile}
        showMuteAction={canMute}
      />
      <Slot />
    </ProfileRouteContainer>
  );
}

function ProfileRouteContainer({
  children,
  scrollKey,
}: {
  children: ReactNode;
  scrollKey: string;
}) {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : (
    <PaginationScrollView key={scrollKey} style={styles.nativeRoot}>
      {children}
    </PaginationScrollView>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
