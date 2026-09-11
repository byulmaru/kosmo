import { Slot, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeftIcon } from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileConnectionListState } from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { getProfileConnectionKind, normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileConnectionKind } from '@/components/profile/route';
import type { TabOption } from '@/components/ui/Tabs';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const connectionOptions: readonly TabOption<ProfileConnectionKind>[] = [
  { label: '팔로워', value: 'followers' },
  { label: '팔로잉', value: 'following' },
];

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileByHandle(handle: $handle) {
      id
      displayName
      handle
      relativeHandle
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
  const connectionKind = getProfileConnectionKind(pathname);
  const scrollKey = pathname;
  const pathSegments = pathname.split('/').filter(Boolean);
  const isProfileHome =
    pathSegments.length === 1 &&
    (pathSegments[0]?.length ?? 0) > 1 &&
    pathSegments[0]?.startsWith('@');
  const fallbackRelativeHandle = `@${handle}`;
  const router = useRouter();
  const theme = useTheme();
  const backButton = (
    <IconButton
      accessibilityLabel="뒤로 가기"
      onPress={() => router.back()}
      style={styles.back}
      targetSize={44}
      visualSize={44}
    >
      <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );

  return (
    <RouteBoundary
      error={
        connectionKind
          ? (retry) => (
              <ProfileRouteContainer scrollKey={scrollKey}>
                <ProfileConnectionChrome
                  displayName={fallbackRelativeHandle}
                  kind={connectionKind}
                  relativeHandle={fallbackRelativeHandle}
                />
                <ProfileConnectionListState kind={connectionKind} onRetry={retry} state="error" />
              </ProfileRouteContainer>
            )
          : isProfileHome
            ? (retry) => (
                <ProfileRouteContainer scrollKey={scrollKey}>
                  <PageHeader leading={backButton} title="" />
                  <StateView
                    actionLabel="다시 시도"
                    alert
                    description="잠시 후 다시 시도해주세요."
                    onAction={retry}
                    title="프로필을 불러오지 못했어요"
                  />
                </ProfileRouteContainer>
              )
            : undefined
      }
      key={`${handle}:${connectionKind ?? 'profile'}`}
      loading={
        <ProfileRouteContainer scrollKey={scrollKey}>
          {connectionKind ? (
            <>
              <ProfileConnectionChrome
                displayName={fallbackRelativeHandle}
                kind={connectionKind}
                relativeHandle={fallbackRelativeHandle}
              />
              <ProfileConnectionListState kind={connectionKind} state="loading" />
            </>
          ) : (
            <>
              {isProfileHome ? <PageHeader leading={backButton} title="" /> : null}
              <ProfileHero loading />
            </>
          )}
        </ProfileRouteContainer>
      }
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent
        backButton={backButton}
        connectionKind={connectionKind}
        handle={handle}
        scrollKey={scrollKey}
        showPageHeader={isProfileHome}
      />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({
  backButton,
  connectionKind,
  handle,
  scrollKey,
  showPageHeader,
}: {
  backButton: ReactNode;
  connectionKind: ProfileConnectionKind | null;
  handle: string;
  scrollKey: string;
  showPageHeader: boolean;
}) {
  const { fetchKey } = useRouteBoundary();
  const { selectedProfileId } = useSession();
  const data = useLazyLoadQuery<ProfileLayoutQueryType>(
    ProfileLayoutQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;
  if (!profile) {
    const missingState = (
      <StateView
        description={`@${handle} 프로필이 존재하지 않아요.`}
        title="프로필을 찾을 수 없어요"
      />
    );

    return showPageHeader ? (
      <ProfileRouteContainer scrollKey={scrollKey}>
        <PageHeader leading={backButton} title="" />
        {missingState}
      </ProfileRouteContainer>
    ) : (
      missingState
    );
  }

  if (connectionKind) {
    return (
      <ProfileRouteContainer scrollKey={scrollKey}>
        <ProfileConnectionChrome
          displayName={profile.displayName || profile.handle}
          kind={connectionKind}
          relativeHandle={profile.relativeHandle}
        />
        <Slot />
      </ProfileRouteContainer>
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
      {showPageHeader ? (
        <PageHeader leading={backButton} title={profile.displayName} titleLines={1} />
      ) : null}
      <ProfileHero
        key={selectedProfileId}
        action={relationshipAction}
        heading={!showPageHeader}
        profile={profile}
        showMuteAction={canMute}
      />
      <Slot />
    </ProfileRouteContainer>
  );
}

function ProfileConnectionChrome({
  displayName,
  kind,
  relativeHandle,
}: {
  displayName: string;
  kind: ProfileConnectionKind;
  relativeHandle: string;
}) {
  const router = useRouter();
  const theme = useTheme();
  const profileHref = `/${relativeHandle}` as Href;

  return (
    <>
      <PageHeader
        leading={
          <IconButton
            accessibilityLabel="프로필로 돌아가기"
            onPress={() => router.replace(profileHref)}
            targetSize={44}
            visualSize={44}
          >
            <ArrowLeft color={theme.foregroundPrimary} size={iconSizes[24]} strokeWidth={2} />
          </IconButton>
        }
        title={`${displayName}님의 ${kind === 'followers' ? '팔로워' : '팔로잉'}`}
      />
      <TabList
        accessibilityLabel="프로필 관계"
        onValueChange={(nextKind) => {
          if (nextKind !== kind) {
            router.replace(`${profileHref}/${nextKind}` as Href);
          }
        }}
        value={kind}
        variant="underline"
      >
        {connectionOptions.map((option) => (
          <Tab key={option.value} option={option} />
        ))}
      </TabList>
    </>
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
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
