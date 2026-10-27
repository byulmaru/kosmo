import { ContentReportTargetType } from '@kosmo/core/enums';
import {
  Slot,
  Stack,
  useCurrentRouteInfo,
  useNavigation,
  usePathname,
  useRouter,
} from 'expo-router';
import { ArrowLeft, ChevronLeftIcon } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery, useQueryLoader } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import {
  getContentReportBlockProfile,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { PageHeader } from '@/components/PageHeader';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileConnectionListState } from '@/components/profile/ProfileConnectionList';
import { ProfileHero } from '@/components/profile/ProfileHero';
import {
  ProfileRouteContainer,
  ProfileRouteProvider,
} from '@/components/profile/ProfileRouteShell';
import { getProfileConnectionKind, normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
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
import { ProfilePostListPageQuery } from './index';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { PreloadedQuery } from 'react-relay';
import type { ProfileConnectionKind } from '@/components/profile/route';
import type { TabOption } from '@/components/ui/Tabs';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from './__generated__/ProfilePostListPageQuery.graphql';

const connectionOptions: readonly TabOption<ProfileConnectionKind>[] = [
  { label: '팔로워', value: 'followers' },
  { label: '팔로잉', value: 'following' },
];

function getProfileHandleParam(params: object | undefined): string | string[] | undefined {
  if (!params || !('profileHandle' in params)) {
    return undefined;
  }

  const value = params.profileHandle;
  return typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    ? value
    : undefined;
}

function getProfileScreenParam(params: object | undefined): string | undefined {
  if (!params || !('screen' in params)) {
    return undefined;
  }

  return typeof params.screen === 'string' ? params.screen : undefined;
}

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
    }
  }
`;

export default function ProfileLayout() {
  // Keep a stacked profile bound to its own route when another screen becomes active.
  const routeInfo = useCurrentRouteInfo();
  const handle = normalizeProfileHandle(routeInfo?.params.profileHandle);
  const profilePathname = routeInfo?.pathname ?? '';
  const globalPathname = usePathname();
  const navigationState = useNavigation().getState();
  // Native layout route info names the parent; resolve only its connection child globally.
  const pathname =
    globalPathname.startsWith(`${profilePathname}/`) && getProfileConnectionKind(globalPathname)
      ? globalPathname
      : profilePathname;
  const { width } = useWindowDimensions();
  const { status } = useSession();
  const connectionKind = getProfileConnectionKind(pathname);
  const scrollKey = pathname;
  const pathSegments = pathname.split('/').filter(Boolean);
  const isProfileHome =
    pathSegments.length === 1 &&
    (pathSegments[0]?.length ?? 0) > 1 &&
    pathSegments[0]?.startsWith('@');
  const activeProfileParent = navigationState?.routes[navigationState.index ?? 0];
  const profileRouteState = activeProfileParent?.state;
  const activeProfileChild = profileRouteState?.routes[profileRouteState.index ?? 0];
  const activeProfileRouteHandle = getProfileHandleParam(activeProfileParent?.params);
  const activeProfileChildName =
    activeProfileChild?.name ?? getProfileScreenParam(activeProfileParent?.params);
  const isProfilePostsRoute =
    !connectionKind &&
    isProfileHome &&
    activeProfileChildName === 'index' &&
    normalizeProfileHandle(activeProfileRouteHandle) === handle;
  const fallbackRelativeHandle = `@${handle}`;
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
  const guestMobileWebProfileHome =
    Platform.OS === 'web' &&
    getShellLayout(Platform.OS === 'web', width) === 'mobile' &&
    status === 'guest' &&
    isProfileHome;
  const headerLeading = guestMobileWebProfileHome ? <NavigationDrawerTrigger /> : backButton;

  return (
    <ProfilePostsQueryOwner enabled={isProfilePostsRoute} handle={handle} key={handle}>
      {(postsQueryReference, retryPosts) => (
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
                    <ProfileConnectionListState
                      kind={connectionKind}
                      onRetry={retry}
                      state="error"
                    />
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
          <ProfileLayoutContent
            headerLeading={headerLeading}
            connectionKind={connectionKind}
            handle={handle}
            postsQueryReference={postsQueryReference}
            retryPosts={retryPosts}
            scrollKey={scrollKey}
            showPageHeader={isProfileHome}
          />
        </RouteBoundary>
      )}
    </ProfilePostsQueryOwner>
  );
}

function ProfilePostsQueryOwner({
  children,
  enabled,
  handle,
}: {
  children: (
    queryReference: PreloadedQuery<ProfilePostListPageQueryType> | null,
    retryPosts: () => void,
  ) => ReactNode;
  enabled: boolean;
  handle: string;
}) {
  const [queryReference, loadPosts, disposePosts] =
    useQueryLoader<ProfilePostListPageQueryType>(ProfilePostListPageQuery);
  const retryPosts = useCallback(() => {
    if (enabled) {
      loadPosts({ handle }, { fetchPolicy: 'network-only' });
    }
  }, [enabled, handle, loadPosts]);

  useEffect(() => {
    if (enabled) {
      loadPosts({ handle }, { fetchPolicy: 'store-and-network' });
    } else {
      disposePosts();
    }
  }, [disposePosts, enabled, handle, loadPosts]);

  return children(enabled ? (queryReference ?? null) : null, retryPosts);
}

function ProfileLayoutContent({
  headerLeading,
  connectionKind,
  handle,
  postsQueryReference,
  retryPosts,
  scrollKey,
  showPageHeader,
}: {
  headerLeading: ReactNode;
  connectionKind: ProfileConnectionKind | null;
  handle: string;
  postsQueryReference: PreloadedQuery<ProfilePostListPageQueryType> | null;
  retryPosts: () => void;
  scrollKey: string;
  showPageHeader: boolean;
}) {
  const { fetchKey } = useRouteBoundary();
  const { selectedProfileId, sessionId } = useSession();
  const data = useLazyLoadQuery<ProfileLayoutQueryType>(
    ProfileLayoutQuery,
    { handle },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;
  const reportItem = useContentReportMenuItem({
    blockProfile: getContentReportBlockProfile(profile),
    id: profile?.id ?? '',
    kind: ContentReportTargetType.PROFILE,
    label: profile?.relativeHandle ?? '',
  });
  const blocking = Boolean(profile?.viewerState?.profileBlock);
  const blockedBy = Boolean(profile?.viewerState?.blockedBy);

  if (!profile) {
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
        displayName={profile.displayName || profile.handle}
        kind={connectionKind}
        relativeHandle={profile.relativeHandle}
      />
    );

    return (
      <ProfileRouteProvider
        chrome={chrome}
        postsQueryReference={postsQueryReference}
        retryPosts={retryPosts}
        scrollKey={scrollKey}
      >
        {Platform.OS === 'web' ? (
          <Slot />
        ) : (
          <View style={styles.nativeRoute}>
            <Stack screenOptions={{ headerShown: false }} />
          </View>
        )}
      </ProfileRouteProvider>
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
      <ProfileViewAnalytics key={profile.id} />
      {showPageHeader ? (
        <PageHeader leading={headerLeading} title={profile.displayName} titleLines={1} />
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

  return (
    <ProfileRouteProvider
      chrome={chrome}
      postsQueryReference={postsQueryReference}
      retryPosts={retryPosts}
      scrollKey={scrollKey}
    >
      {blockedProfileRoute ??
        (Platform.OS === 'web' ? (
          <Slot />
        ) : (
          <View style={styles.nativeRoute}>
            <Stack screenOptions={{ headerShown: false }} />
          </View>
        ))}
    </ProfileRouteProvider>
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
  nativeRoute: { flex: 1, minWidth: 0 },
});
