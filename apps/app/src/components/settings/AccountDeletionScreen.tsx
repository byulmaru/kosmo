import { Info } from 'lucide-react-native';
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
const ACCOUNT_DELETION_NOTICES = [
  '코스모의 계정·프로필·게시글 정보는 탈퇴 완료일부터 30일간 보관한 뒤 파기해요.',
  '진행 중인 신고·분쟁·수사기관 요청에 필요한 기록은 필요한 기간만 보관한 뒤 지체 없이 파기해요.',
  '법에 따라 보관해야 하는 정보는 정해진 기간 동안 보관한 뒤 파기해요.',
  '별마루 ID는 유지돼요. 별마루 ID 탈퇴는 따로 신청해야 해요.',
];

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
        description={`활성 Profile ${state.activeProfileCount}개가 남아 있어 코스모를 탈퇴할 수 없어요. 활성 Profile을 먼저 비활성화해주세요.`}
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
        message="탈퇴는 취소할 수 없어요."
        onCancel={onCancel ?? (() => undefined)}
        onConfirm={error ? (onRetry ?? (() => undefined)) : (onConfirm ?? (() => undefined))}
        pending={pending}
        tone="danger"
      >
        <View style={styles.notices}>
          {ACCOUNT_DELETION_NOTICES.map((notice) => (
            <View key={notice} style={styles.notice}>
              <View
                accessible={false}
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
              >
                <Info color={theme.foregroundSecondary} size={20} strokeWidth={2} />
              </View>
              <Text style={[styles.noticeText, { color: theme.foregroundSecondary }]}>
                {notice}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.acknowledgement}>
          <Checkbox
            accessibilityLabel={ACKNOWLEDGEMENT_LABEL}
            checked={acknowledged}
            disabled={pending}
            onCheckedChange={onAcknowledgementChange ?? (() => undefined)}
          />
          <Text style={[styles.acknowledgementLabel, { color: theme.foregroundSecondary }]}>
            {ACKNOWLEDGEMENT_LABEL}
          </Text>
        </View>
      </ConfirmationContent>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[12], padding: space[16], width: '100%' },
  error: textStyles.uiCopyM,
  notices: { gap: space[12] },
  notice: { alignItems: 'flex-start', flexDirection: 'row', gap: space[8] },
  noticeText: { ...textStyles.uiCopyM, flex: 1, minWidth: 0 },
  acknowledgement: { alignItems: 'center', flexDirection: 'row', gap: space[8], minHeight: 48 },
  acknowledgementLabel: { ...textStyles.uiCopyM, flex: 1 },
});
