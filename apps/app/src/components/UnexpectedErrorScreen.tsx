import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useToast } from '@/components/ui/ToastProvider';
import { copyToClipboard } from '@/observability/clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import { Button } from './ui/Button';
import type { ClipboardWriter } from '@/observability/clipboard';

type CopyStatus = 'idle' | 'success' | 'failure';

export type UnexpectedErrorScreenProps = {
  eventId?: string;
  onRetry: () => void;
  onSafeNavigate: () => void;
  writeClipboard?: ClipboardWriter;
};

export function UnexpectedErrorScreen({
  eventId,
  onRetry,
  onSafeNavigate,
  writeClipboard = copyToClipboard,
}: UnexpectedErrorScreenProps) {
  const theme = useTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copying, setCopying] = useState(false);
  const compact = width < breakpoints.compact;

  const copyEventId = async () => {
    if (!eventId || copying) {
      return;
    }

    setCopying(true);
    let copied = false;
    try {
      copied = await writeClipboard(eventId);
    } catch {
      copied = false;
    }
    setCopyStatus(copied ? 'success' : 'failure');
    setCopying(false);
    showToast(copied ? '오류 추적 ID를 복사했어요.' : '오류 추적 ID를 복사하지 못했어요.');
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingHorizontal: compact ? spacing.lg : spacing.xl },
      ]}
      style={{ backgroundColor: theme.background }}
    >
      <View
        accessibilityRole="alert"
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          문제가 발생했어요
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          화면을 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </Text>

        {eventId ? (
          <View style={[styles.eventCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.eventLabel, { color: theme.textSecondary }]}>오류 추적 ID</Text>
            <Text selectable style={[styles.eventId, { color: theme.text }]}>
              {eventId}
            </Text>
            <Button
              accessibilityLabel="오류 추적 ID 복사"
              disabled={copying}
              loading={copying}
              onPress={copyEventId}
              style={styles.copyButton}
              tone="secondary"
            >
              오류 추적 ID 복사
            </Button>
          </View>
        ) : (
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            오류 추적 ID를 확인하지 못했지만, 아래 복구 동작은 계속 사용할 수 있습니다.
          </Text>
        )}

        {copyStatus !== 'idle' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: copyStatus === 'success' ? theme.text : theme.danger }]}
          >
            {copyStatus === 'success'
              ? '오류 추적 ID를 복사했습니다.'
              : '오류 추적 ID를 복사하지 못했습니다.'}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button onPress={onRetry} style={styles.actionButton}>
            다시 시도
          </Button>
          <Button onPress={onSafeNavigate} style={styles.actionButton} tone="secondary">
            안전한 화면으로 이동
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxxl },
  card: {
    alignSelf: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.lg,
    maxWidth: 560,
    padding: spacing.xl,
    width: '100%',
  },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.xl },
  description: { fontFamily: 'SUIT', ...typography.md },
  eventCard: { borderRadius: radii.md, gap: spacing.sm, padding: spacing.lg },
  eventLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  eventId: { fontFamily: 'SUIT', ...typography.md },
  copyButton: { alignSelf: 'flex-start', minHeight: 48 },
  status: { fontFamily: 'SUIT', ...typography.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionButton: { minHeight: 48 },
});
