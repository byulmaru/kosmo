import { Slot, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { Ban, ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { FollowButton } from '@/components/profile/FollowButton';
import { useProfileBlockMutations } from '@/components/profile/ProfileBlockController';
import { StaleProfileBlockRequestError } from '@/components/profile/profileBlockErrors';
import { ProfileHero } from '@/components/profile/ProfileHero';
import { normalizeProfileHandle } from '@/components/profile/route';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ProfileLayoutQuery as ProfileLayoutQueryType } from './__generated__/ProfileLayoutQuery.graphql';

const ProfileLayoutQuery = graphql`
  query ProfileLayoutQuery($handle: String!) {
    profileBlockStatus(handle: $handle) {
      blockedBy
      blocking
      profileBlockId
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
        scrollKey={scrollKey}
        showPageHeader={isProfileHome}
      />
    </RouteBoundary>
  );
}

function ProfileLayoutContent({
  backButton,
  handle,
  scrollKey,
  showPageHeader,
}: {
  backButton: ReactNode;
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
  const blockStatus = data.profileBlockStatus;
  const { selectedProfileId } = useSession();
  const { changeBlocked } = useProfileBlockMutations();
  const { showToast } = useToast();
  const [confirmation, setConfirmation] = useState<'block' | 'unblock' | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const cancelRef = useRef<View>(null);
  const stateActionRef = useRef<View>(null);
  const focusMenuTrigger = useRef<() => void>(() => {});

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const closeConfirmation = () => {
    if (!inFlight.current) {
      setConfirmation(null);
    }
  };
  const requestChange = async () => {
    if (inFlight.current || !confirmation || !selectedProfileId) {
      return;
    }
    const nextBlocked = confirmation === 'block';
    const profileBlockId = blockStatus?.profileBlockId;
    if ((nextBlocked && !profile?.id) || (!nextBlocked && !profileBlockId)) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      await changeBlocked(
        {
          handle,
          ownerProfileId: selectedProfileId,
          profileBlockId,
          targetProfileId: profile?.id,
        },
        nextBlocked,
      );
      if (!mounted.current) {
        return;
      }
      setConfirmation(null);
      showToast(nextBlocked ? '프로필을 차단했어요' : '차단을 해제했어요', {
        tone: 'success',
      });
    } catch (error) {
      if (!mounted.current || error instanceof StaleProfileBlockRequestError) {
        return;
      }
      showToast(
        nextBlocked
          ? '프로필을 차단하지 못했어요. 다시 시도해 주세요.'
          : '차단을 해제하지 못했어요. 다시 시도해 주세요.',
        { tone: 'danger' },
      );
    } finally {
      if (mounted.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  };
  const confirmationModal = (
    <ModalSheet
      dismissDisabled={pending}
      onClose={closeConfirmation}
      onDismiss={() => {
        if (profile) {
          focusMenuTrigger.current();
        } else {
          stateActionRef.current?.focus();
        }
      }}
      onShow={() => cancelRef.current?.focus()}
      title={
        confirmation === 'block' ? '이 프로필을 차단할까요?' : '이 프로필의 차단을 해제할까요?'
      }
      visible={confirmation !== null}
    >
      <ConfirmationContent
        cancelLabel="취소"
        cancelRef={cancelRef}
        confirmLabel={confirmation === 'block' ? '차단' : '차단 해제'}
        message={
          confirmation === 'block'
            ? '서로의 프로필과 게시물을 볼 수 없게 되고, 팔로우 관계와 요청이 삭제돼요.'
            : '차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.'
        }
        onCancel={closeConfirmation}
        onConfirm={() => void requestChange()}
        pending={pending}
      />
    </ModalSheet>
  );

  if (blockStatus?.blocking) {
    return (
      <>
        <View style={styles.blockedState}>
          <StateView title="차단한 프로필입니다" />
          <Button
            controlRef={stateActionRef}
            accessibilityLabel="차단 해제"
            onPress={() => setConfirmation('unblock')}
            tone="secondary"
          >
            차단 해제
          </Button>
        </View>
        {confirmationModal}
      </>
    );
  }

  if (blockStatus?.blockedBy) {
    return <StateView title="이 프로필을 볼 수 없습니다" />;
  }

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
      {confirmationModal}
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
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  blockedState: { alignItems: 'center' },
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
