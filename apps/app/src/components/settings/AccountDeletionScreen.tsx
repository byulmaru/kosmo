import { StyleSheet, Text, View } from 'react-native';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';

export type AccountDeletionState =
  | { phase: 'loading' }
  | { phase: 'load-error' }
  | { activeProfileCount: number; phase: 'blocked' }
  | { acknowledged: boolean; phase: 'idle' }
  | { phase: 'pending' }
  | { acknowledged: boolean; phase: 'error' }
  | { phase: 'success' };

export type AccountDeletionScreenProps = {
  onAcknowledgementChange?: (checked: boolean) => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  onRetry?: () => void;
  state?: AccountDeletionState;
};

const INITIAL_STATE: AccountDeletionState = { phase: 'loading' };
const ACKNOWLEDGEMENT_LABEL = '탈퇴 후 처리 내용을 모두 확인했습니다.';

/** Controlled presentation only: the caller owns eligibility, mutation, credentials and navigation. */
export function AccountDeletionScreen({
  onAcknowledgementChange,
  onCancel,
  onConfirm,
  onRetry,
  state = INITIAL_STATE,
}: AccountDeletionScreenProps) {
  const theme = useTheme();

  if (state.phase === 'loading') {
    return <StateView loading title="코스모 탈퇴 정보를 불러오는 중입니다." />;
  }

  if (state.phase === 'load-error') {
    return (
      <StateView
        actionLabel="다시 시도"
        alert
        description="잠시 후 다시 시도해주세요."
        onAction={onRetry ?? (() => undefined)}
        title="코스모 탈퇴 정보를 불러오지 못했어요"
      />
    );
  }

  if (state.phase === 'blocked') {
    return (
      <StateView
        description={`활성 Profile ${state.activeProfileCount}개가 남아 있어 코스모를 탈퇴할 수 없어요. 모든 Profile을 먼저 비활성화해주세요.`}
        title="코스모 탈퇴를 할 수 없어요"
      />
    );
  }

  if (state.phase === 'success') {
    return <StateView description="로그인 화면으로 이동합니다." title="코스모 탈퇴가 완료됐어요" />;
  }

  const pending = state.phase === 'pending';
  const acknowledged = state.phase === 'pending' ? true : state.acknowledged;
  const error = state.phase === 'error';

  return (
    <View style={styles.root}>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.feedbackDangerBase }]}>
          코스모 탈퇴를 완료하지 못했어요. 다시 시도해주세요.
        </Text>
      ) : null}
      <ConfirmationContent
        cancelLabel="취소"
        confirmDisabled={pending ? undefined : !acknowledged}
        confirmLabel={error ? '다시 시도' : '코스모 탈퇴'}
        message="탈퇴하면 Kosmo Account가 삭제된 상태로 남고 모든 로그인 세션이 종료됩니다. 유예기간 없이 즉시 처리되며, 같은 Byulmaru ID로 Kosmo에 다시 가입할 수 없습니다. 재가입 제한은 임시 조치입니다."
        onCancel={onCancel ?? (() => undefined)}
        onConfirm={error ? (onRetry ?? (() => undefined)) : (onConfirm ?? (() => undefined))}
        pending={pending}
        tone="danger"
      >
        <AccountDeletionAcknowledgement
          acknowledged={acknowledged}
          disabled={pending}
          onAcknowledgementChange={onAcknowledgementChange ?? (() => undefined)}
        />
      </ConfirmationContent>
    </View>
  );
}

function AccountDeletionAcknowledgement({
  acknowledged,
  disabled,
  onAcknowledgementChange,
}: {
  acknowledged: boolean;
  disabled: boolean;
  onAcknowledgementChange: (checked: boolean) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.acknowledgement}>
      <Checkbox
        accessibilityLabel={ACKNOWLEDGEMENT_LABEL}
        checked={acknowledged}
        disabled={disabled}
        onCheckedChange={onAcknowledgementChange}
      />
      <Text style={[styles.acknowledgementLabel, { color: theme.foregroundSecondary }]}>
        {ACKNOWLEDGEMENT_LABEL}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[12], padding: space[16], width: '100%' },
  error: textStyles.uiCopyM,
  acknowledgement: { alignItems: 'center', flexDirection: 'row', gap: space[8], minHeight: 48 },
  acknowledgementLabel: { ...textStyles.uiCopyM, flex: 1 },
});
