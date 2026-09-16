import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { AccountDeletionScreen } from '@/components/settings/AccountDeletionScreen';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { useNavigationGuard } from '@/components/shell/NavigationGuardContext';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useAccountDeletionCleanup } from '@/session/logout';
import { useTheme } from '@/theme/ThemeProvider';
import type { SettingsAccountDeletionDeleteAccountMutation } from './__generated__/SettingsAccountDeletionDeleteAccountMutation.graphql';
import type { SettingsAccountDeletionEligibilityQuery } from './__generated__/SettingsAccountDeletionEligibilityQuery.graphql';

const AccountDeletionEligibilityQuery = graphql`
  query SettingsAccountDeletionEligibilityQuery {
    accountDeletionEligibility {
      activeProfileCount
      canDelete
    }
  }
`;

const DeleteAccountMutation = graphql`
  mutation SettingsAccountDeletionDeleteAccountMutation {
    deleteAccount {
      activeProfileCount
      completed
    }
  }
`;

export default function SettingsAccountDeletionRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const [pending, setPending] = useState(false);
  const { register, request } = useNavigationGuard();
  const navigateBack = useCallback(() => {
    const navigate = () => returnToSettingsParent('/settings/account-deletion', router);
    if (!request(navigate)) {
      navigate();
    }
  }, [request, router]);
  const navigationGuard = useCallback(() => pending, [pending]);

  useEffect(() => register(navigationGuard), [navigationGuard, register]);

  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="설정으로 돌아가기"
        disabled={pending}
        onPress={navigateBack}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <>
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader leading={backButton} title="코스모 탈퇴" />
      ) : null}
      <RouteBoundary
        error={(retry) => <AccountDeletionScreen onRetry={retry} state={{ phase: 'load-error' }} />}
        loading={<AccountDeletionScreen state={{ phase: 'loading' }} />}
        title="코스모 탈퇴 정보를 불러오지 못했어요"
      >
        <SettingsAccountDeletionContent onCancel={navigateBack} onPendingChange={setPending} />
      </RouteBoundary>
    </>
  );
}

function SettingsAccountDeletionContent({
  onCancel,
  onPendingChange,
}: {
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const { fetchKey, refetch } = useRouteBoundary();
  const data = useLazyLoadQuery<SettingsAccountDeletionEligibilityQuery>(
    AccountDeletionEligibilityQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const [commitDeleteAccount] =
    useMutation<SettingsAccountDeletionDeleteAccountMutation>(DeleteAccountMutation);
  const { error: logoutError, logout, pending: logoutPending } = useAccountDeletionCleanup();
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'pending' | 'error' | 'success'>('idle');
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const eligibility = data.accountDeletionEligibility;
  const pending = phase === 'pending' || logoutPending;
  const eligibilityComplete =
    typeof eligibility.canDelete === 'boolean' &&
    typeof eligibility.activeProfileCount === 'number';
  const canDelete = eligibilityComplete && eligibility.canDelete === true;
  const activeProfileCount = eligibilityComplete ? eligibility.activeProfileCount : 0;

  useEffect(() => onPendingChange(pending), [onPendingChange, pending]);

  const confirm = useCallback(() => {
    if (
      (phase !== 'idle' && phase !== 'error') ||
      blockedCount !== null ||
      !eligibilityComplete ||
      !canDelete ||
      !acknowledged
    ) {
      return;
    }

    setPhase('pending');
    onPendingChange(true);
    commitDeleteAccount({
      variables: {},
      onCompleted: (response, errors) => {
        const payload = response.deleteAccount;
        if (errors?.length || !payload || payload.completed !== true) {
          onPendingChange(false);
          if (
            !errors?.length &&
            payload &&
            payload.completed === false &&
            typeof payload.activeProfileCount === 'number' &&
            payload.activeProfileCount > 0
          ) {
            setBlockedCount(payload.activeProfileCount);
            setAcknowledged(false);
            setPhase('idle');
          } else {
            setPhase('error');
          }
          return;
        }

        setPhase('success');
        onPendingChange(true);
        logout();
      },
      onError: () => {
        onPendingChange(false);
        setPhase('error');
      },
    });
  }, [
    acknowledged,
    blockedCount,
    canDelete,
    commitDeleteAccount,
    eligibilityComplete,
    logout,
    onPendingChange,
    phase,
  ]);

  const state =
    phase === 'pending'
      ? ({ phase: 'pending' } as const)
      : phase === 'error'
        ? ({ acknowledged, phase: 'error' } as const)
        : phase === 'success'
          ? ({ phase: 'success' } as const)
          : blockedCount !== null
            ? ({ activeProfileCount: blockedCount, phase: 'blocked' } as const)
            : canDelete
              ? ({ acknowledged, phase: 'idle' } as const)
              : ({ activeProfileCount, phase: 'blocked' } as const);

  if (logoutError) {
    return (
      <StateView
        actionLabel="다시 시도"
        alert
        description="탈퇴는 완료됐지만 로그인 상태를 정리하지 못했어요. 다시 시도해주세요."
        onAction={logout}
        title="로그인 상태를 정리하지 못했어요"
      />
    );
  }

  if (!eligibilityComplete) {
    return <AccountDeletionScreen onRetry={refetch} state={{ phase: 'load-error' }} />;
  }

  return (
    <AccountDeletionScreen
      onAcknowledgementChange={(checked) => {
        if (!pending && (phase === 'idle' || phase === 'error')) {
          setAcknowledged(checked);
        }
      }}
      onCancel={onCancel}
      onConfirm={confirm}
      onRetry={confirm}
      state={state}
    />
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
});
