import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useToast } from '@/components/ui/ToastProvider';
import { copyToClipboard } from '@/observability/clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import { Button } from './ui/Button';
import type { ClipboardWriter } from '@/observability/clipboard';

export type UnexpectedErrorScreenProps = {
  eventId?: string;
  onRetry: () => void;
  onSafeNavigate: () => void;
  occurrenceKey?: number;
  writeClipboard?: ClipboardWriter;
};

export function UnexpectedErrorScreen({
  eventId,
  onRetry,
  onSafeNavigate,
  occurrenceKey,
  writeClipboard = copyToClipboard,
}: UnexpectedErrorScreenProps) {
  const theme = useTheme();
  const { dismissToast, showToast } = useToast();
  const { width } = useWindowDimensions();
  const [copying, setCopying] = useState(false);
  const mountedRef = useRef(true);
  const copyRequestRef = useRef(0);
  const compact = width < breakpoints.compact;

  useEffect(() => {
    copyRequestRef.current += 1;
    setCopying(false);
    dismissToast();
  }, [dismissToast, eventId, occurrenceKey]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      copyRequestRef.current += 1;
      dismissToast();
    };
  }, [dismissToast]);

  const clearTransientFeedback = () => {
    copyRequestRef.current += 1;
    setCopying(false);
    dismissToast();
  };

  const copyEventId = async () => {
    if (!eventId || copying) {
      return;
    }

    const requestId = ++copyRequestRef.current;
    setCopying(true);
    let copied = false;
    try {
      copied = await writeClipboard(eventId);
    } catch {
      copied = false;
    }
    if (!mountedRef.current || requestId !== copyRequestRef.current) {
      return;
    }
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

        <View style={styles.actions}>
          <Button
            onPress={() => {
              clearTransientFeedback();
              onRetry();
            }}
            style={styles.actionButton}
          >
            다시 시도
          </Button>
          <Button
            onPress={() => {
              clearTransientFeedback();
              onSafeNavigate();
            }}
            style={styles.actionButton}
            tone="secondary"
          >
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionButton: { minHeight: 48 },
});
