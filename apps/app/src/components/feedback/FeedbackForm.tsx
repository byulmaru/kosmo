import { feedbackBodySchema } from '@kosmo/core/validation';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { FeedbackKind } from '@kosmo/core/enums';
import type { FeedbackFormSubmitFeedbackMutation } from './__generated__/FeedbackFormSubmitFeedbackMutation.graphql';

const feedbackOptions = [
  { label: '좋아요', value: 'POSITIVE' },
  { label: '아쉬워요', value: 'NEGATIVE' },
  { label: '이 기능이 필요해요', value: 'FEATURE_REQUEST' },
  { label: '버그를 발견했어요', value: 'BUG_REPORT' },
] as const;

type FeedbackStatus = 'idle' | 'success' | 'error';

export type FeedbackFormState = {
  dirty: boolean;
  submitting: boolean;
};

type Props = {
  onStateChange?: (state: FeedbackFormState) => void;
};

const SubmitFeedbackMutation = graphql`
  mutation FeedbackFormSubmitFeedbackMutation($input: SubmitFeedbackInput!) {
    submitFeedback(input: $input) {
      completed
    }
  }
`;

export function FeedbackForm({ onStateChange }: Props) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const [kind, setKind] = useState<FeedbackKind>('POSITIVE');
  const [body, setBody] = useState('');
  const [bodyTouched, setBodyTouched] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [commit, submitting] =
    useMutation<FeedbackFormSubmitFeedbackMutation>(SubmitFeedbackMutation);
  const dirty = kind !== 'POSITIVE' || body.length > 0;
  const latestStateRef = useRef<FeedbackFormState>({ dirty, submitting });
  latestStateRef.current = { dirty, submitting };
  const parsedBody = feedbackBodySchema.safeParse(body);
  const bodyError = parsedBody.success ? null : parsedBody.error.issues[0]?.message;
  const showBodyError = bodyTouched || status === 'error';
  const canSubmit = !submitting && !bodyError;
  const actionLabel = status === 'error' ? '다시 시도' : '보내기';
  const reportState = (state: FeedbackFormState) => {
    latestStateRef.current = state;
    onStateChange?.(state);
  };
  const selectKind = (value: FeedbackKind) => {
    reportState({ dirty: value !== 'POSITIVE' || body.length > 0, submitting });
    setKind(value);
    setStatus('idle');
  };

  useEffect(() => {
    onStateChange?.(latestStateRef.current);
  }, [dirty, onStateChange, submitting]);

  const submit = () => {
    if (!canSubmit || !parsedBody.success) {
      return;
    }

    reportState({ dirty, submitting: true });
    setStatus('idle');
    commit({
      variables: {
        input: {
          body: parsedBody.data,
          kind,
        },
      },
      onCompleted: (response, errors) => {
        if (errors?.length || !response.submitFeedback?.completed) {
          reportState({ dirty, submitting: false });
          setStatus('error');
          return;
        }

        reportState({ dirty: false, submitting: false });
        setKind('POSITIVE');
        setBody('');
        setBodyTouched(false);
        setStatus('success');
      },
      onError: () => {
        reportState({ dirty, submitting: false });
        setStatus('error');
      },
    });
  };

  return (
    <View
      style={[
        styles.root,
        web ? null : styles.nativeRoot,
        web ? null : { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={styles.header}>
        {web ? null : (
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            피드백 보내기
          </Text>
        )}
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          KOSMO를 더 좋게 만들 수 있도록 의견을 들려주세요.
        </Text>
      </View>

      <RadioGroup
        accessibilityLabel="피드백 종류"
        disabled={submitting}
        onChange={selectKind}
        options={feedbackOptions}
        style={web ? styles.webOptions : styles.nativeOptions}
        value={kind}
      >
        {feedbackOptions.map((option, index) => {
          const selected = option.value === kind;
          return (
            <RadioOption
              key={option.value}
              option={option}
              style={({ pressed }) => [
                styles.option,
                web ? styles.webOption : styles.nativeOption,
                web && index === feedbackOptions.length - 1 ? styles.webOptionLast : null,
                {
                  backgroundColor: selected || pressed ? theme.surface : 'transparent',
                  borderBottomColor: web ? theme.divider : undefined,
                  borderColor: web ? undefined : selected ? theme.primary : theme.border,
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
            </RadioOption>
          );
        })}
      </RadioGroup>

      <TextArea
        accessibilityLabel="피드백 내용"
        aria-invalid={Boolean(bodyError && showBodyError)}
        editable={!submitting}
        error={showBodyError ? (bodyError ?? undefined) : undefined}
        label="피드백 내용"
        onChangeText={(value) => {
          reportState({ dirty: kind !== 'POSITIVE' || value.length > 0, submitting });
          setBody(value);
          setBodyTouched(true);
          setStatus('idle');
        }}
        placeholder="어떤 점이 좋았거나 불편했는지 알려주세요."
        value={body}
      />

      {status === 'success' ? (
        <Text accessibilityLiveRegion="polite" style={[styles.success, { color: theme.text }]}>
          피드백을 전달했습니다. 감사합니다!
        </Text>
      ) : null}
      {status === 'error' ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.danger }]}
        >
          피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.
        </Text>
      ) : null}

      <View style={web ? styles.webActions : styles.nativeActions}>
        <Button
          accessibilityLabel={status === 'error' ? '피드백 다시 시도' : '피드백 보내기'}
          accessibilityState={{ busy: submitting, disabled: !canSubmit }}
          aria-busy={submitting}
          disabled={!canSubmit}
          loading={submitting}
          onPress={submit}
          style={[styles.submitButton, web ? styles.webSubmitButton : null]}
        >
          {actionLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    width: '100%',
  },
  nativeRoot: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxWidth: 680,
    padding: spacing.xl,
  },
  header: { gap: spacing.xs },
  title: { fontFamily: 'SUIT', fontSize: 24, fontWeight: '700', lineHeight: 32 },
  description: { fontFamily: 'SUIT', ...typography.md },
  webOptions: { gap: 0 },
  nativeOptions: { gap: spacing.sm },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  webOption: {
    borderRadius: radii.sm,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.sm,
  },
  webOptionLast: { borderBottomWidth: 0 },
  nativeOption: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
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
  submitButton: { minHeight: 48 },
  webSubmitButton: { width: '100%' },
  webActions: { width: '100%' },
  nativeActions: { alignItems: 'flex-start' },
});
