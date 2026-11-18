import { ContentReportTargetType } from '@kosmo/core/enums';
import {
  useCurrentRouteInfo,
  useIsFocused,
  useNavigation,
  usePathname,
  useRouter,
} from 'expo-router';
import { ArrowLeft, ChevronLeftIcon } from 'lucide-react-native';
import { Suspense, useDeferredValue, useEffect, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import {
  getContentReportBlockProfile,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { FollowButton } from '@/components/profile/FollowButton';
import {
  ProfileConnectionList,
  ProfileConnectionListState,
} from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { ProfilePostsContent } from '@/components/profile/ProfilePostsContent';
import { ProfileRouteContainer } from '@/components/profile/ProfileRouteShell';
import { getProfileConnectionKind } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { MobileWebRouteMenu } from '@/components/shell/MobileWebRouteMenu';
import { NavigationDrawerTrigger } from '@/components/shell/NavigationDrawerTrigger';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import type { ProfileConnectionKind } from '@/components/profile/route';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
import type { ProfileScreenQuery as ProfileScreenQueryType } from './__generated__/ProfileScreenQuery.graphql';

const connectionOptions: readonly { label: string; value: ProfileConnectionKind }[] = [
  { label: '팔로워', value: 'followers' },
  { label: '팔로잉', value: 'following' },
];

const ProfileScreenQuery = graphql`
  query ProfileScreenQuery(
    $handle: String!
    $posts: Boolean!
    $followers: Boolean!
    $following: Boolean!
  ) {
    ...ProfilePostsContent_query
      @arguments(handle: $handle)
      @include(if: $posts)
      @alias(as: "posts")
    profileByHandle(handle: $handle) {
      id
      displayName
      handle
      relativeHandle
      instance {
        kind
      }
      viewerState {
        blockedBy
        isSelf
        membership {
          role
        }
        profileBlock {
          id
        }
      }
      ...ProfileHero_profile
      ...ContentReportOverlay_blockProfile
      ...FollowButton_profile
      ...ProfileConnectionList_followersProfile @include(if: $followers) @alias(as: "followers")
      ...ProfileConnectionList_followingProfile @include(if: $following) @alias(as: "following")
    }
  }
`;

export default function ProfileScreen({
  connectionKind,
  handle,
}: {
  connectionKind: ProfileConnectionKind | null;
  handle: string;
}) {
  const routeInfo = useCurrentRouteInfo();
  const globalPathname = usePathname();
  const routePathname = routeInfo?.pathname ?? `/@${handle}`;
  const pathname =
    globalPathname.startsWith(`${routePathname}/`) &&
    getProfileConnectionKind(globalPathname) === connectionKind
      ? globalPathname
      : routePathname;
  const pathSegments = pathname.split('/').filter(Boolean);
  const isProfileHome =
    pathSegments.length === 1 &&
    (pathSegments[0]?.length ?? 0) > 1 &&
    pathSegments[0]?.startsWith('@');
  const scrollKey = pathname || `/@${handle}${connectionKind ? `/${connectionKind}` : ''}`;
  const navigation = useNavigation();
  const routeBoundary = useRef<RouteBoundaryHandle>(null);
  const active = useIsFocused();
  useEffect(() => {
    let wasBlurred = false;
    const unsubscribeBlur = navigation.addListener('blur', () => {
      wasBlurred = true;
    });
    const unsubscribeFocus = navigation.addListener('focus', () => {
      if (wasBlurred) {
        wasBlurred = false;
        routeBoundary.current?.refetch();
      }
    });
    return () => {
      unsubscribeBlur();
      unsubscribeFocus();
    };
  }, [connectionKind, handle, navigation]);
  const showPageHeader = isProfileHome && connectionKind == null;
  const { width } = useWindowDimensions();
  const { status } = useSession();
  const guestMobileWebProfileHome =
    Platform.OS === 'web' &&
    getShellLayout(Platform.OS === 'web', width) === 'mobile' &&
    status === 'guest' &&
    showPageHeader;
  const router = useRouter();
  const theme = useTheme();
  const backButton = (
    <IconButton
      accessibilityLabel="뒤로 가기"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      style={styles.back}
      targetSize={44}
      visualSize={44}
    >
      <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );
  const headerLeading = guestMobileWebProfileHome ? <NavigationDrawerTrigger /> : backButton;
  const fallbackRelativeHandle = `@${handle}`;

  return (
    <>
      {!isProfileHome && !connectionKind ? <MobileWebRouteMenu /> : null}
      <RouteBoundary
        ref={routeBoundary}
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
                    <PageHeader leading={headerLeading} title="" />
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
                {isProfileHome ? <PageHeader leading={headerLeading} title="" /> : null}
                <ProfileHero loading />
              </>
            )}
          </ProfileRouteContainer>
        }
        title="프로필을 불러오지 못했어요"
      >
        <ProfileScreenContent
          active={active}
          connectionKind={connectionKind}
          handle={handle}
          headerLeading={headerLeading}
          scrollKey={scrollKey}
          showPageHeader={showPageHeader}
        />
      </RouteBoundary>
    </>
  );
}

function ProfileScreenContent({
  active,
  connectionKind,
  handle,
  headerLeading,
  scrollKey,
  showPageHeader,
}: {
  active: boolean;
  connectionKind: ProfileConnectionKind | null;
  handle: string;
  headerLeading: ReactNode;
  scrollKey: string;
  showPageHeader: boolean;
}) {
  const { fetchKey } = useRouteBoundary();
  const { selectedProfileId, sessionId } = useSession();
  const data = useLazyLoadQuery<ProfileScreenQueryType>(
    ProfileScreenQuery,
    {
      handle,
      posts: connectionKind == null,
      followers: connectionKind === 'followers',
      following: connectionKind === 'following',
    },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const posts = useDeferredValue(data.posts, null);
  const profile = data.profileByHandle;
  const reportItem = useContentReportMenuItem({
    blockProfile: getContentReportBlockProfile(profile),
    id: profile?.id ?? '',
    kind: ContentReportTargetType.PROFILE,
    label: profile?.relativeHandle ?? '',
  });
  const blocking = Boolean(profile?.viewerState?.profileBlock);
  const blockedBy = Boolean(profile?.viewerState?.blockedBy);

  if (!profile || !profile.instance) {
    const missingState = (
      <StateView
        description={`@${handle} 프로필이 존재하지 않아요.`}
        title="프로필을 찾을 수 없어요"
      />
    );

    return showPageHeader ? (
      <ProfileRouteContainer scrollKey={scrollKey}>
        <PageHeader leading={headerLeading} title="" />
        {missingState}
      </ProfileRouteContainer>
    ) : (
      missingState
    );
  }

  if (connectionKind) {
    const chrome = (
      <ProfileConnectionChrome
        displayName={profile.displayName || profile.relativeHandle}
        kind={connectionKind}
        relativeHandle={profile.relativeHandle}
      />
    );

    return (
      <ProfileRouteContainer scrollKey={scrollKey}>
        {chrome}
        <Suspense
          key={fetchKey}
          fallback={<ProfileConnectionListState kind={connectionKind} state="loading" />}
        >
          {connectionKind === 'followers' && profile.followers ? (
            <ProfileConnectionList active={active} kind="followers" profile={profile.followers} />
          ) : null}
          {connectionKind === 'following' && profile.following ? (
            <ProfileConnectionList active={active} kind="following" profile={profile.following} />
          ) : null}
        </Suspense>
      </ProfileRouteContainer>
    );
  }

  const canEdit =
    profile.instance.kind === 'LOCAL' &&
    profile.viewerState?.isSelf === true &&
    profile.viewerState.membership?.role === 'OWNER';
  const relationshipAction = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" style={styles.editButton} tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : blockedBy && !blocking ? undefined : (
    <FollowButton profile={profile} />
  );
  const chrome = (
    <>
      {showPageHeader ? (
        <PageHeader
          leading={headerLeading}
          title={profile.displayName ?? profile.relativeHandle}
          titleLines={1}
        />
      ) : null}
      <ProfileHero
        key={selectedProfileId}
        action={relationshipAction}
        heading={!showPageHeader}
        moreItems={sessionId ? [reportItem] : undefined}
        profile={profile}
      />
    </>
  );
  const blockedProfileContent = !blockedBy ? null : (
    <StateView title="이 프로필을 볼 수 없습니다" />
  );
  const blockedProfileRoute = blockedProfileContent ? (
    <ProfileRouteContainer scrollKey={scrollKey}>
      {chrome}
      {blockedProfileContent}
    </ProfileRouteContainer>
  ) : null;

  const header: ReactElement = <>{chrome}</>;

  return (
    <View key={scrollKey} style={styles.root}>
      <ProfileViewAnalytics key={profile.id} />
      {blockedProfileRoute ?? (
        <Suspense
          key={fetchKey}
          fallback={
            <PostList active={active} header={header} loading reselectDestination="profile" />
          }
        >
          {posts ? (
            <ProfilePostsContent
              active={active}
              handle={handle}
              header={header}
              query={posts}
              scrollKey={scrollKey}
            />
          ) : (
            <PostList active={active} header={header} loading reselectDestination="profile" />
          )}
        </Suspense>
      )}
    </View>
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

function ProfileViewAnalytics() {
  useEffect(() => {
    trackAnalytics('profile_view_succeeded', {});
  }, []);
  return null;
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  editButton: { minWidth: 96, width: 96 },
  root: { flex: 1, minHeight: 0, width: '100%' },
});
