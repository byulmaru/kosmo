import {
  feedbackAttachmentLimit,
  feedbackAttachmentMaxBytes,
  feedbackBodySchema,
} from '@kosmo/core/validation';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlusIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { releaseImagePreview } from '@/components/media/imageUpload';
import { ComposerTool } from '@/components/post/PostComposer';
import { PostComposerMediaItemsTarget } from '@/components/post/PostComposerMediaItemsTarget';
import { Button } from '@/components/ui/Button';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, layoutRecipes, radii, spacing, typography } from '@/theme/tokens';
import type { FeedbackKind } from '@kosmo/core/enums';
import type { UploadableMap } from 'relay-runtime';
import type { PostComposerSelectedMediaItem } from '@/components/post/PostComposerMediaItemsTarget';
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

type NativeUploadable = { readonly name: string; readonly type: string; readonly uri: string };
type FeedbackMediaItem = PostComposerSelectedMediaItem;

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
  const [attachments, setAttachments] = useState<FeedbackMediaItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const attachmentsRef = useRef<readonly FeedbackMediaItem[]>(attachments);
  const selectingRef = useRef(false);
  const nextAttachmentKey = useRef(0);
  const [commit, submitting] =
    useMutation<FeedbackFormSubmitFeedbackMutation>(SubmitFeedbackMutation);
  attachmentsRef.current = attachments;
  const dirty = kind !== 'POSITIVE' || body.length > 0 || attachments.length > 0;
  const latestStateRef = useRef<FeedbackFormState>({ dirty, submitting });
  latestStateRef.current = { dirty, submitting };
  const parsedBody = feedbackBodySchema.safeParse(body);
  const bodyError = parsedBody.success ? null : parsedBody.error.issues[0]?.message;
  const showBodyError = bodyTouched || status === 'error';
  const canSubmit = !submitting && !selecting && !bodyError;
  const actionLabel = status === 'error' ? '다시 시도' : '보내기';
  const reportState = (state: FeedbackFormState) => {
    latestStateRef.current = state;
    onStateChange?.(state);
  };
  const selectKind = (value: FeedbackKind) => {
    reportState({
      dirty: value !== 'POSITIVE' || body.length > 0 || attachments.length > 0,
      submitting,
    });
    setKind(value);
    setStatus('idle');
  };

  useEffect(() => {
    onStateChange?.(latestStateRef.current);
  }, [dirty, onStateChange, submitting]);

  const selectMedia = async () => {
    const available = feedbackAttachmentLimit - attachmentsRef.current.length;
    if (available <= 0 || submitting || selectingRef.current) {
      return;
    }
    selectingRef.current = true;
    setSelecting(true);
    setAttachmentError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        selectionLimit: available,
      });
      if (result.canceled) {
        return;
      }
      const supported = result.assets.filter((asset) => isSupportedFeedbackAsset(asset));
      if (supported.length !== result.assets.length) {
        setAttachmentError('정적 JPEG, PNG, WebP 이미지만 첨부할 수 있어요.');
      }
      const withinSize = supported.filter((asset) => {
        const size = asset.file?.size ?? asset.fileSize;
        return size === undefined || size <= feedbackAttachmentMaxBytes;
      });
      if (withinSize.length !== supported.length) {
        setAttachmentError('이미지는 한 장당 5MB 이하로 첨부해주세요.');
      }
      const next = withinSize.map((asset) => ({
        asset,
        altText: '',
        key: `feedback-media-${++nextAttachmentKey.current}`,
        state: 'selected' as const,
      }));
      setAttachments((current) => [...current, ...next].slice(0, feedbackAttachmentLimit));
      setStatus('idle');
    } catch {
      setAttachmentError('이미지를 선택하지 못했습니다.');
    } finally {
      selectingRef.current = false;
      setSelecting(false);
    }
  };

  const removeAttachment = (key: string) => {
    const removed = attachmentsRef.current.find((item) => item.key === key);
    if (removed && Platform.OS === 'web') {
      releaseImagePreview(removed.asset.uri);
    }
    setAttachments((current) => current.filter((item) => item.key !== key));
  };

  useEffect(() => {
    return () => {
      for (const item of attachmentsRef.current) {
        if (Platform.OS === 'web') {
          releaseImagePreview(item.asset.uri);
        }
      }
    };
  }, []);

  const submit = () => {
    if (!canSubmit || !parsedBody.success) {
      return;
    }

    reportState({ dirty, submitting: true });
    setStatus('idle');
    commit({
      variables: {
        input: {
          attachments: attachments.map(() => null) as unknown as Blob[],
          body: parsedBody.data,
          kind,
        },
      },
      uploadables: createFeedbackUploadables(attachments),
      onCompleted: (response, errors) => {
        if (errors?.length || !response.submitFeedback?.completed) {
          reportState({ dirty, submitting: false });
          setStatus('error');
          return;
        }

        reportState({ dirty: false, submitting: false });
        setKind('POSITIVE');
        setBody('');
        for (const item of attachmentsRef.current) {
          if (Platform.OS === 'web') {
            releaseImagePreview(item.asset.uri);
          }
        }
        setAttachments([]);
        setAttachmentError(null);
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
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          KOSMO를 더 좋게 만들 수 있도록 의견을 들려주세요.
        </Text>
      </View>

      <RadioGroup
        accessibilityLabel="피드백 종류"
        disabled={submitting}
        onChange={selectKind}
        style={web ? styles.webOptions : styles.nativeOptions}
        value={kind}
      >
        {feedbackOptions.map((option) => {
          return <RadioOption key={option.value} option={option} />;
        })}
      </RadioGroup>

      <TextArea
        accessibilityLabel="피드백 내용"
        aria-invalid={Boolean(bodyError && showBodyError)}
        editable={!submitting}
        error={showBodyError ? (bodyError ?? undefined) : undefined}
        label="피드백 내용"
        onChangeText={(value) => {
          reportState({
            dirty: kind !== 'POSITIVE' || value.length > 0 || attachments.length > 0,
            submitting,
          });
          setBody(value);
          setBodyTouched(true);
          setStatus('idle');
        }}
        placeholder="어떤 점이 좋았거나 불편했는지 알려주세요."
        value={body}
      />

      <View style={styles.attachmentHeader}>
        <Text style={[styles.attachmentLabel, { color: theme.textSecondary }]}>
          이미지로 상황을 더 알려주세요 (선택)
        </Text>
        <ComposerTool
          accessibilityLabel="이미지 추가"
          disabled={submitting || selecting || attachments.length >= feedbackAttachmentLimit}
          onPress={() => void selectMedia()}
        >
          <ImagePlusIcon color={theme.foregroundPrimary} size={20} />
        </ComposerTool>
      </View>
      <PostComposerMediaItemsTarget
        compact
        disabled={submitting || selecting}
        media={attachments}
        onRemove={removeAttachment}
        sensitiveMedia={false}
      />
      {attachmentError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {attachmentError}
        </Text>
      ) : null}

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
    ...layoutRecipes.formStack,
    width: '100%',
  },
  nativeRoot: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxWidth: 680,
    padding: spacing.xl,
  },
  header: { gap: spacing.xs },
  attachmentHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  attachmentLabel: { fontFamily: fontFamilies.ui, ...typography.sm },
  description: { fontFamily: fontFamilies.ui, ...typography.md },
  webOptions: { gap: 0 },
  nativeOptions: { gap: spacing.sm },
  success: { fontFamily: fontFamilies.ui, ...typography.sm },
  error: { fontFamily: fontFamilies.ui, ...typography.sm },
  submitButton: { minHeight: 48 },
  webSubmitButton: { width: '100%' },
  webActions: { width: '100%' },
  nativeActions: { alignItems: 'flex-start' },
});

function isSupportedFeedbackAsset(asset: ImagePicker.ImagePickerAsset): boolean {
  const contentType = (asset.mimeType ?? asset.file?.type ?? '').toLowerCase();
  return (
    contentType === 'image/jpeg' || contentType === 'image/png' || contentType === 'image/webp'
  );
}

function createFeedbackUploadables(items: readonly FeedbackMediaItem[]): UploadableMap {
  const uploadables = Object.fromEntries(
    items.map((item, index) => {
      const contentType = (item.asset.mimeType ?? item.asset.file?.type ?? '').toLowerCase();
      const extension =
        contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
      const uploadable: Blob | NativeUploadable = item.asset.file ?? {
        name: `feedback-${index + 1}.${extension}`,
        type: contentType,
        uri: item.asset.uri,
      };
      return [`input.attachments.${index}`, uploadable];
    }),
  );
  return uploadables as unknown as UploadableMap;
}
