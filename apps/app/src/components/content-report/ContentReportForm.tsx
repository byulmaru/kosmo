import { ContentReportReason } from '@kosmo/core/enums';
import { contentReportDetailsMaxLength, contentReportInputSchema } from '@kosmo/core/validation';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, layoutRecipes, spacing, typography } from '@/theme/tokens';
import { getContentReportFormState } from './contentReportState';
import type { ContentReportFormSubmitContentReportMutation } from './__generated__/ContentReportFormSubmitContentReportMutation.graphql';
import type { ContentReportTarget } from './ContentReportContext';
import type { ContentReportFormState } from './contentReportState';

const contentReportOptions = [
  { label: '유해하거나 부적절한 콘텐츠', value: ContentReportReason.HARMFUL_CONTENT },
  { label: '괴롭힘·혐오·위협', value: ContentReportReason.HARASSMENT_HATE_THREAT },
  { label: '스팸·사기', value: ContentReportReason.SPAM_FRAUD },
  { label: '아동 안전 우려', value: ContentReportReason.CHILD_SAFETY },
  { label: '기타', value: ContentReportReason.OTHER },
] as const;

type ContentReportStatus = 'idle' | 'rejected' | 'unknown';

type Props = {
  onDelivered?: () => void;
  onStateChange?: (state: ContentReportFormState) => void;
  target: ContentReportTarget;
};

const SubmitContentReportMutation = graphql`
  mutation ContentReportFormSubmitContentReportMutation($input: SubmitContentReportInput!) {
    submitContentReport(input: $input) {
      status
    }
  }
`;

export function ContentReportForm({ onDelivered, onStateChange, target }: Props) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const [reason, setReason] = useState<ContentReportReason>(ContentReportReason.HARMFUL_CONTENT);
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState<ContentReportStatus>('idle');
  const [commit, submitting] = useMutation<ContentReportFormSubmitContentReportMutation>(
    SubmitContentReportMutation,
  );
  const formState = getContentReportFormState({ details, reason, submitting });
  const latestStateRef = useRef(formState);
  latestStateRef.current = formState;
  const parsedInput = contentReportInputSchema.safeParse({ details, reason });
  const validationError = parsedInput.success ? null : parsedInput.error.issues[0]?.message;
  const showValidationError = validationError != null;
  const canSubmit = !submitting && parsedInput.success;
  const targetLabel = target.kind === 'PROFILE' ? '프로필' : '게시물';
  const reportState = (nextState: ContentReportFormState) => {
    latestStateRef.current = nextState;
    onStateChange?.(nextState);
  };

  useEffect(() => {
    onStateChange?.(latestStateRef.current);
  }, [formState.dirty, onStateChange, submitting]);

  const submit = () => {
    if (!canSubmit || !parsedInput.success) {
      return;
    }

    reportState({ dirty: formState.dirty, submitting: true });
    setStatus('idle');
    commit({
      variables: {
        input: {
          details: parsedInput.data.details,
          reason,
          targetId: target.id,
          targetType: target.kind,
        },
      },
      onCompleted: (response, errors) => {
        const nextStatus = errors?.length ? null : (response.submitContentReport?.status ?? null);
        if (nextStatus === 'DELIVERED') {
          setDetails('');
          setReason(ContentReportReason.HARMFUL_CONTENT);
          reportState({ dirty: false, submitting: false });
          onDelivered?.();
          return;
        }

        setStatus(nextStatus === 'REJECTED' ? 'rejected' : 'unknown');
        reportState({ dirty: formState.dirty, submitting: false });
      },
      onError: () => {
        setStatus('unknown');
        reportState({ dirty: formState.dirty, submitting: false });
      },
    });
  };

  return (
    <View style={[styles.root, web ? null : styles.nativeRoot]}>
      <View style={styles.header}>
        <Text
          accessibilityLabel={`신고 대상 ${target.label}`}
          style={[styles.target, { color: theme.text }]}
        >
          신고 대상: {target.label}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          신고할 {targetLabel}의 사유를 선택해주세요. 신고 대상은 제출할 때 다시 확인합니다.
        </Text>
      </View>

      <RadioGroup
        accessibilityLabel={`${targetLabel} 신고 사유`}
        disabled={submitting}
        onChange={(value) => {
          setReason(value);
          setStatus('idle');
        }}
        style={styles.options}
        value={reason}
      >
        {contentReportOptions.map((option) => (
          <RadioOption key={option.value} option={option} />
        ))}
      </RadioGroup>

      <TextArea
        accessibilityLabel={`${targetLabel} 신고 상세 내용`}
        aria-invalid={Boolean(validationError && showValidationError)}
        editable={!submitting}
        error={showValidationError ? (validationError ?? undefined) : undefined}
        label={`상세 내용 (${reason === ContentReportReason.OTHER ? '필수' : '선택'})`}
        maxLength={contentReportDetailsMaxLength}
        onChangeText={(value) => {
          setDetails(value);
          setStatus('idle');
        }}
        placeholder="신고 사유를 설명해주세요."
        value={details}
      />
      <Text style={[styles.counter, { color: theme.textSecondary }]}>
        {details.length.toLocaleString()} / {contentReportDetailsMaxLength.toLocaleString()}
      </Text>

      {status === 'rejected' ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.danger }]}
        >
          신고를 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.
        </Text>
      ) : null}
      {status === 'unknown' ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.warning, { color: theme.text }]}
        >
          전달 결과를 확인하지 못했습니다. 중복 신고가 될 수 있으니 확인 후 수동으로 다시
          시도해주세요.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          accessibilityLabel={
            status === 'rejected' || status === 'unknown' ? '신고 다시 시도' : '신고하기'
          }
          accessibilityState={{ busy: submitting, disabled: !canSubmit }}
          aria-busy={submitting}
          disabled={!canSubmit}
          loading={submitting}
          onPress={submit}
          style={styles.submitButton}
        >
          {status === 'rejected' || status === 'unknown' ? '다시 시도' : '신고하기'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...layoutRecipes.formStack, width: '100%' },
  nativeRoot: { padding: spacing.xl },
  header: { gap: spacing.xs },
  target: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.md },
  description: { fontFamily: fontFamilies.ui, ...typography.md },
  options: { gap: spacing.xs },
  counter: { alignSelf: 'flex-end', fontFamily: fontFamilies.ui, ...typography.xsm },
  error: { fontFamily: fontFamilies.ui, ...typography.sm },
  warning: { fontFamily: fontFamilies.ui, ...typography.sm },
  actions: { alignItems: 'flex-start', width: '100%' },
  submitButton: { minHeight: 48, width: '100%' },
});
