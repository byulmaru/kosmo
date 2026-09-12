import { Slot, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!, $withProfileBlockStatus: Boolean!) {
    profileBlockStatus(handle: $handle) @include(if: $withProfileBlockStatus) {
      blockedBy
    }
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
  const scrollKey = pathname;
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const pathSegments = pathname.split('/').filter(Boolean);
  const isProfileHome =
    pathSegments.length === 1 &&
    (pathSegments[0]?.length ?? 0) > 1 &&
    pathSegments[0]?.startsWith('@');
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
      key={`${actorLifecycleKey}:${handle}`}
      error={
        isProfileHome
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
      loading={
        <ProfileRouteContainer scrollKey={scrollKey}>
          {isProfileHome ? <PageHeader leading={backButton} title="" /> : null}
          <ProfileHero loading />
        </ProfileRouteContainer>
      }
      title="프로필을 불러오지 못했어요"
    >
      <ProfileLayoutContent
        backButton={backButton}
        handle={handle}
        pathname={pathname}
        scrollKey={scrollKey}
        showPageHeader={isProfileHome}
      />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({
  backButton,
  handle,
  pathname,
  scrollKey,
  showPageHeader,
}: {
  backButton: ReactNode;
  handle: string;
  pathname: string;
  scrollKey: string;
  showPageHeader: boolean;
}) {
  const { fetchKey } = useRouteBoundary();
  const { selectedProfileId, selectedProfileKind } = useSession();
  const hasSelectedLocalProfile = selectedProfileKind === 'LOCAL';
  const data = useLazyLoadQuery<ProfileLayoutQueryType>(
    ProfileLayoutQuery,
    { handle, withProfileBlockStatus: Boolean(selectedProfileId && hasSelectedLocalProfile) },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const profile = data.profileByHandle;
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
    const missingState = blockedBy ? (
      <StateView controlRef={contentStateRef} title="이 프로필을 볼 수 없습니다" />
    ) : (
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

  const canEdit =
    profile.instance.kind === 'LOCAL' &&
    profile.viewerState?.isSelf === true &&
    profile.viewerState.membership?.role === 'OWNER';
  const canMute = Boolean(
    selectedProfileId && hasSelectedLocalProfile && !profile.viewerState?.isSelf,
  );
  const relationshipAction = canEdit ? (
    <NavigationLink href={'/profile-edit' as Href}>
      <Button accessibilityLabel="프로필 편집" tone="secondary">
        편집
      </Button>
    </NavigationLink>
  ) : blocking && profileBlock ? (
    <ProfileBlockAction
      nextBlocked={false}
      onActionRef={(node) => {
        stateActionRef.current = node;
      }}
      onFeedback={onBlockFeedback}
      profileBlock={profileBlock}
      surface="button"
    />
  ) : blockedBy ? undefined : (
    <FollowButton
      onActionRef={(node) => {
        stateActionRef.current = node;
      }}
      profile={profile}
    />
  );
  const profileAction = relationshipAction;
  const relationshipRoute = pathname.endsWith('/followers') || pathname.endsWith('/following');
  const profileContent = relationshipRoute ? (
    <Slot />
  ) : blockedBy ? (
    <StateView controlRef={contentStateRef} title="게시물을 볼 수 없습니다" />
  ) : blocking && !blockedContentVisible ? (
    <StateView
      actionLabel="게시물 보기"
      onAction={() => setBlockedContentVisible(true)}
      title="차단한 프로필의 게시물입니다"
    />
  ) : (
    <Slot />
  );

  return (
    <>
      <ProfileRouteContainer scrollKey={scrollKey}>
        {showPageHeader ? (
          <PageHeader leading={backButton} title={profile.displayName} titleLines={1} />
        ) : null}
        <ProfileHero
          key={selectedProfileId}
          action={profileAction}
          blockAction={
            selectedProfileId &&
            hasSelectedLocalProfile &&
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
          heading={!showPageHeader}
          onMenuTriggerReady={(focusTrigger) => {
            focusMenuTrigger.current = focusTrigger;
          }}
          profile={profile}
          showMuteAction={canMute && !blocking && !blockedBy}
        />
        {profileContent}
      </ProfileRouteContainer>
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
