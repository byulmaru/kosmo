import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { FeedbackFormSubmitFeedbackMutation } from './__generated__/FeedbackFormSubmitFeedbackMutation.graphql';

const feedbackOptions = [
  { label: '좋아요', value: 'POSITIVE' },
  { label: '아쉬워요', value: 'NEGATIVE' },
  { label: '이 기능이 필요해요', value: 'FEATURE_REQUEST' },
  { label: '버그를 발견했어요', value: 'BUG_REPORT' },
] as const;

type FeedbackKind = (typeof feedbackOptions)[number]['value'];
type FeedbackStatus = 'idle' | 'success' | 'error';

const SubmitFeedbackMutation = graphql`
  mutation FeedbackFormSubmitFeedbackMutation($input: SubmitFeedbackInput!) {
    submitFeedback(input: $input) {
      completed
    }
  }
`;

const sentryEventIdPattern = /^[\da-f]{32}$/iu;

export function FeedbackForm() {
  const theme = useTheme();
  const [kind, setKind] = useState<FeedbackKind>('POSITIVE');
  const [body, setBody] = useState('');
  const [sentryEventId, setSentryEventId] = useState('');
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [commit, submitting] =
    useMutation<FeedbackFormSubmitFeedbackMutation>(SubmitFeedbackMutation);
  const trimmedBody = body.trim();
  const trimmedSentryEventId = sentryEventId.trim();
  const bodyError =
    trimmedBody.length === 0
      ? '피드백 내용을 입력해주세요.'
      : trimmedBody.length > 2000
        ? '피드백은 2,000자 이내로 입력해주세요.'
        : null;
  const sentryEventIdError =
    kind === 'BUG_REPORT' &&
    trimmedSentryEventId &&
    !sentryEventIdPattern.test(trimmedSentryEventId)
      ? 'Sentry 이벤트 ID는 32자리 16진수여야 합니다.'
      : null;
  const canSubmit = !submitting && !bodyError && !sentryEventIdError;
  const actionLabel = status === 'error' ? '다시 시도' : '보내기';

  const submit = () => {
    if (!canSubmit) {
      setError(bodyError ?? sentryEventIdError);
      setStatus('error');
      return;
    }

    setError(null);
    setStatus('idle');
    commit({
      variables: {
        input: {
          body: trimmedBody,
          kind,
          ...(kind === 'BUG_REPORT' && trimmedSentryEventId
            ? { sentryEventId: trimmedSentryEventId.toLowerCase() }
            : {}),
        },
      },
      onCompleted: (response, errors) => {
        if (errors?.length || !response.submitFeedback?.completed) {
          setError('피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.');
          setStatus('error');
          return;
        }

        setBody('');
        setSentryEventId('');
        setError(null);
        setStatus('success');
      },
      onError: () => {
        setError('피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.');
        setStatus('error');
      },
    });
  };

  return (
    <View
      accessibilityLabel="피드백 보내기"
      style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>피드백 보내기</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          KOSMO를 더 좋게 만들 수 있도록 의견을 들려주세요.
        </Text>
      </View>

      <View accessibilityLabel="피드백 종류" role="radiogroup" style={styles.options}>
        {feedbackOptions.map((option) => {
          const selected = option.value === kind;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              key={option.value}
              onPress={() => {
                setKind(option.value);
                setStatus('idle');
                setError(null);
                if (option.value !== 'BUG_REPORT') {
                  setSentryEventId('');
                }
              }}
              role="radio"
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? theme.surface
                    : pressed
                      ? theme.surface
                      : 'transparent',
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? theme.primary : theme.textSecondary },
                ]}
              >
                {selected ? (
                  <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />
                ) : null}
              </View>
              <Text style={[styles.optionLabel, { color: theme.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextArea
        accessibilityLabel="피드백 내용"
        aria-invalid={Boolean(bodyError && status === 'error')}
        editable={!submitting}
        error={status === 'error' ? (bodyError ?? undefined) : undefined}
        label="피드백 내용"
        maxLength={2000}
        onChangeText={(value) => {
          setBody(value);
          setStatus('idle');
          setError(null);
        }}
        placeholder="어떤 점이 좋았거나 불편했는지 알려주세요."
        value={body}
      />

      {kind === 'BUG_REPORT' ? (
        <TextField
          accessibilityLabel="Sentry 이벤트 ID (선택)"
          aria-invalid={Boolean(sentryEventIdError)}
          editable={!submitting}
          error={sentryEventIdError ?? undefined}
          label="Sentry 이벤트 ID (선택)"
          onChangeText={(value) => {
            setSentryEventId(value);
            setStatus('idle');
            setError(null);
          }}
          placeholder="32자리 이벤트 ID"
          value={sentryEventId}
        />
      ) : null}

      {status === 'success' ? (
        <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.text }]}>
          피드백을 전달했습니다. 감사합니다!
        </Text>
      ) : null}
      {status === 'error' && error ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.danger }]}
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          accessibilityLabel={status === 'error' ? '피드백 다시 시도' : '피드백 보내기'}
          accessibilityState={{ busy: submitting, disabled: !canSubmit }}
          disabled={!canSubmit}
          loading={submitting}
          onPress={submit}
        >
          {actionLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.lg,
    marginTop: spacing.xl,
    maxWidth: 680,
    padding: spacing.xl,
    width: '100%',
  },
  header: { gap: spacing.xs },
  title: { fontFamily: 'SUIT', fontSize: 24, fontWeight: '700', lineHeight: 32 },
  description: { fontFamily: 'SUIT', ...typography.md },
  options: { gap: spacing.sm },
  option: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  radio: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioDot: { borderRadius: radii.full, height: 10, width: 10 },
  optionLabel: { fontFamily: 'SUIT', ...typography.md },
  success: { fontFamily: 'SUIT', ...typography.sm },
  error: { fontFamily: 'SUIT', ...typography.sm },
  actions: { alignItems: 'flex-start' },
});
