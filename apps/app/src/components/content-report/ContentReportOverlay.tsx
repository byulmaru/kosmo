import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ProfileBlockAction } from '@/components/profile/ProfileBlockAction';
import { Button } from '@/components/ui/Button';
import { FormOverlay } from '@/components/ui/FormOverlay';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ContentReportForm } from './ContentReportForm';
import type { ContentReportTarget } from './ContentReportContext';

type Props = {
  onRequestClose: () => void;
  target: ContentReportTarget | null;
  visible: boolean;
};

type ContentProps = Omit<Props, 'target'> & { target: ContentReportTarget };

export function ContentReportOverlay({ onRequestClose, target, visible }: Props) {
  if (!target) {
    return null;
  }

  return (
    <ContentReportOverlayContent
      key={`${target.kind}:${target.id}`}
      onRequestClose={onRequestClose}
      target={target}
      visible={visible}
    />
  );
}

function ContentReportOverlayContent({ onRequestClose, target, visible }: ContentProps) {
  const theme = useTheme();
  const [delivered, setDelivered] = useState(false);
  const focusCompletionClose = useCallback((control: View | null) => {
    if (Platform.OS === 'web') {
      control?.focus();
    }
  }, []);
  const title = target.kind === 'PROFILE' ? '프로필 신고' : '게시물 신고';

  return (
    <FormOverlay
      bodyPadding={spacing.lg}
      continueEditingFocusSelector='textarea, [role="radio"]'
      discardConfirmLabel="신고 버리기"
      discardTitle="작성 중인 신고를 버릴까요?"
      fallbackFocusSelector='[data-content-report-focus-fallback], [data-testid="universal-shell-root"]'
      limitNativeHeight
      onRequestClose={onRequestClose}
      renderForm={({ close, onStateChange }) =>
        delivered ? (
          <View style={styles.completion}>
            <Text
              accessibilityLiveRegion="polite"
              accessibilityRole="header"
              style={[styles.completionTitle, { color: theme.foregroundPrimary }]}
            >
              신고를 전달했어요
            </Text>
            <View style={styles.actions}>
              {target.blockProfile ? (
                <ProfileBlockAction
                  buttonLabel="차단하기"
                  nextBlocked
                  onBlocked={close}
                  profile={target.blockProfile}
                  surface="button"
                />
              ) : null}
              <Button
                controlRef={focusCompletionClose}
                onPress={close}
                style={styles.actionButton}
                tone="secondary"
              >
                닫기
              </Button>
            </View>
          </View>
        ) : (
          <ContentReportForm
            onDelivered={() => setDelivered(true)}
            onStateChange={onStateChange}
            target={target}
          />
        )
      }
      testIDPrefix="content-report"
      title={title}
      visible={visible}
    />
  );
}

const styles = StyleSheet.create({
  completion: { gap: spacing.lg, width: '100%' },
  completionTitle: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.lg },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { minHeight: 48, minWidth: 96, width: 96 },
});
