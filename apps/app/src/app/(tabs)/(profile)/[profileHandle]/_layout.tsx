import { ContentReportTargetType } from '@kosmo/core/enums';
import { Navigator, Slot, Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ArrowLeft, ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { useContentReportMenuItem } from '@/components/content-report/ContentReportContext';
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
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { Tab, TabList } from '@/components/ui/Tabs';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
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
    profileBlockStatus(handle: $handle) {
      blockedBy
    }
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
        profileBlock {
          ...ProfileBlockAction_profileBlock
        }
      }
      ...ProfileHero_profile
      ...FollowButton_profile
      ...ProfileBlockAction_profile
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
  const actorLifecycleKey = useRelayActorLifecycleKey();
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

  // 경고나 로딩 화면이 Slot을 숨겨도 route params를 소유한 navigator는 유지한다.
  return (
    <Navigator>
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
        key={`${actorLifecycleKey}:${handle}:${connectionKind ?? 'profile'}`}
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
          pathname={pathname}
          scrollKey={scrollKey}
          showPageHeader={isProfileHome}
        />
      </RouteBoundary>
    </Navigator>
  );
}

function ProfileLayoutContent({
  backButton,
  connectionKind,
  handle,
  pathname,
  scrollKey,
  showPageHeader,
}: {
  backButton: ReactNode;
  connectionKind: ProfileConnectionKind | null;
  handle: string;
  pathname: string;
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
    id: profile?.id ?? '',
    kind: ContentReportTargetType.PROFILE,
    label: profile?.relativeHandle ?? '',
  });
  const blockStatus = data.profileBlockStatus;
  const [blockedContentVisible, setBlockedContentVisible] = useState(false);
  const [focusRevision, setFocusRevision] = useState(0);
  const focusTargetRef = useRef<'content' | 'menu' | 'state' | null>(null);
  const stateActionRef = useRef<View>(null);
  const contentStateRef = useRef<View>(null);
  const focusMenuTrigger = useRef<() => void>(() => {});
  const profileBlock = profile?.viewerState?.profileBlock;
  const blocking = Boolean(profileBlock);
  const blockedBy = Boolean(blockStatus?.blockedBy);

  useEffect(() => {
    const target = focusTargetRef.current;
    focusTargetRef.current = null;
    if (target === 'state') {
      stateActionRef.current?.focus();
    } else if (target === 'content') {
      contentStateRef.current?.focus();
    } else if (target === 'menu') {
      focusMenuTrigger.current();
    }
  }, [focusRevision]);

  const onBlockFeedback = (feedback: { blocked: boolean; status: 'success' | 'error' }) => {
    if (feedback.status !== 'success') {
      return;
    }
    focusTargetRef.current = feedback.blocked ? 'state' : blockedBy ? 'content' : 'menu';
    setFocusRevision((revision) => revision + 1);
  };

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
    const chrome = (
      <ProfileConnectionChrome
        displayName={profile.displayName || profile.handle}
        kind={connectionKind}
        relativeHandle={profile.relativeHandle}
      />
    );

    return (
      <ProfileRouteProvider chrome={chrome} scrollKey={scrollKey}>
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
  const canMute = Boolean(selectedProfileId && !profile.viewerState?.isSelf);
  const relationshipAction = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : blockedBy && !blocking ? undefined : (
    <FollowButton
      onActionRef={(node) => {
        stateActionRef.current = node;
      }}
      onBlockFeedback={onBlockFeedback}
      profile={profile}
    />
  );
  const profileAction = relationshipAction;
  const chrome = (
    <>
      {showPageHeader ? (
        <PageHeader leading={backButton} title={profile.displayName} titleLines={1} />
      ) : null}
      <ProfileHero
        key={selectedProfileId}
        action={profileAction}
        heading={!showPageHeader}
        moreItems={sessionId ? [reportItem] : undefined}
        blockAction={
          selectedProfileId &&
          blockStatus &&
          profile.viewerState?.isSelf !== true &&
          (!blockedBy || blocking)
            ? blocking && profileBlock
              ? {
                  nextBlocked: false,
                  onFeedback: onBlockFeedback,
                  profileBlock,
                }
              : { nextBlocked: true, onFeedback: onBlockFeedback, profile }
            : undefined
        }
        onMenuTriggerReady={(focusTrigger) => {
          focusMenuTrigger.current = focusTrigger;
        }}
        profile={profile}
        showMuteAction={canMute && !blocking && !blockedBy}
      />
    </>
  );

  const relationshipRoute = pathname.endsWith('/followers') || pathname.endsWith('/following');
  const blockedProfileContent = relationshipRoute ? null : blockedBy ? (
    <StateView controlRef={contentStateRef} title="이 프로필을 볼 수 없습니다" />
  ) : blocking && !blockedContentVisible ? (
    <StateView
      actionLabel="게시물 보기"
      onAction={() => setBlockedContentVisible(true)}
      title="차단한 프로필의 게시물입니다"
    />
  ) : null;
  const blockedProfileRoute = blockedProfileContent ? (
    <ProfileRouteContainer scrollKey={scrollKey}>
      {chrome}
      {blockedProfileContent}
    </ProfileRouteContainer>
  ) : null;

  return (
    <ProfileRouteProvider chrome={chrome} scrollKey={scrollKey}>
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

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  nativeRoute: { flex: 1, minWidth: 0 },
});
