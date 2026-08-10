import { Link, Slot, useGlobalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const paginationOwnerKey = `${revision}:${pathname}`;

  return (
    <RouteBoundary
      key={handle}
      loading={
        <ProfileRouteContainer paginationOwnerKey={paginationOwnerKey}>
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      onRetry={() => setFetchKey((key) => key + 1)}
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent
        fetchKey={`${revision}:${fetchKey}`}
        handle={handle}
        paginationOwnerKey={paginationOwnerKey}
      />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({
  fetchKey,
  handle,
  paginationOwnerKey,
}: {
  fetchKey: string;
  handle: string;
  paginationOwnerKey: string;
}) {
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
    <Link asChild href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </Link>
  ) : (
    <FollowButton profile={profile} />
  );

  return (
    <ProfileRouteContainer paginationOwnerKey={paginationOwnerKey}>
      <ProfileHero action={action} profile={profile} />
      <Slot />
    </ProfileRouteContainer>
  );
}

function ProfileRouteContainer({
  children,
  paginationOwnerKey,
}: {
  children: ReactNode;
  paginationOwnerKey: string;
}) {
  return Platform.OS === 'web' ? (
    <View style={styles.webRoot}>{children}</View>
  ) : (
    <PaginationScrollView paginationOwnerKey={paginationOwnerKey} style={styles.nativeRoot}>
      {children}
    </PaginationScrollView>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
