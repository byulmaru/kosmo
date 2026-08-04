import { Camera } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  formatImageUploadFailureMessage,
  formatImageUploadRetryLabel,
} from '@/components/media/imageUploadErrors';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import type { Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileEditImageDraft } from './profileEditState';

type ProfileEditImageFieldsProps = {
  avatar: ProfileEditImageDraft;
  disabled?: boolean;
  header: ProfileEditImageDraft;
  onAvatarEdit?: () => void;
  onAvatarRemove?: () => void;
  onAvatarRetry?: () => void;
  onHeaderEdit?: () => void;
  onHeaderRemove?: () => void;
  onHeaderRetry?: () => void;
};

type ImageFieldStatus = {
  kind: 'info' | 'error';
  message: string;
};

function getImageFieldStatus(
  subject: '아바타 이미지' | '헤더 이미지',
  draft: ProfileEditImageDraft,
): ImageFieldStatus | null {
  if (draft.kind === 'removed') {
    return { kind: 'info', message: `${subject}가 제거됩니다.` };
  }

  if (draft.kind !== 'replacement') {
    return null;
  }

  if (draft.uploadState === 'uploading') {
    return { kind: 'info', message: `${subject} 업로드를 기다리고 있어요.` };
  }

  if (draft.uploadState === 'error') {
    return {
      kind: 'error',
      message: formatImageUploadFailureMessage(
        subject,
        draft.failure ?? { reason: 'transient', stage: 'transfer' },
      ),
    };
  }

  return { kind: 'info', message: `새 ${subject}가 선택됐어요.` };
}

function ImageStatus({
  subject,
  onRetry,
  status,
}: {
  subject: '아바타 이미지' | '헤더 이미지';
  onRetry?: () => void;
  status: ImageFieldStatus | null;
}) {
  const theme = useTheme();

  if (!status) {
    return null;
  }

  return (
    <View style={styles.statusRow}>
      <Text
        accessibilityLiveRegion={status.kind === 'error' ? undefined : 'polite'}
        accessibilityRole={status.kind === 'error' ? 'alert' : undefined}
        style={[
          styles.status,
          { color: status.kind === 'error' ? theme.danger : theme.textSecondary },
        ]}
      >
        {status.message}
      </Text>
      {status.kind === 'error' && onRetry ? (
        <Pressable
          accessibilityLabel={formatImageUploadRetryLabel(subject)}
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.retryLabel, { color: theme.text }]}>다시 시도</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CameraAffordance({ disabled }: { disabled: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.cameraAffordance, { opacity: disabled ? 0.45 : 1 }]}
    >
      <View style={[StyleSheet.absoluteFill, styles.cameraScrim]} />
      <Camera color={colors.light.background} size={22} strokeWidth={2} />
    </View>
  );
}

function ImageEditControl({
  accessibilityLabel,
  disabled,
  draft,
  onEdit,
  onRemove,
  style,
  testID,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  draft: ProfileEditImageDraft;
  onEdit?: () => void;
  onRemove?: () => void;
  style: StyleProp<ViewStyle>;
  testID: string;
}) {
  const theme = useTheme();
  const renderTrigger = ({
    expanded,
    onPress,
    ref,
  }: {
    expanded: boolean;
    onPress: () => void;
    ref: Ref<View>;
  }) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      ref={ref}
      style={style}
      testID={testID}
    >
      {({ pressed }) => (
        <>
          {draft.previewUri ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: draft.previewUri }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: theme.primary }]} />
          )}
          {pressed ? <View style={[StyleSheet.absoluteFill, styles.pressedVeil]} /> : null}
          <CameraAffordance disabled={disabled} />
        </>
      )}
    </Pressable>
  );

  if (!draft.previewUri || !onRemove) {
    return renderTrigger({ expanded: false, onPress: onEdit ?? (() => undefined), ref: null });
  }

  return (
    <ActionMenu
      accessibilityLabel={`${accessibilityLabel} 메뉴`}
      disabled={disabled}
      items={[
        { key: 'change', label: '이미지 변경', onSelect: onEdit ?? (() => undefined) },
        { key: 'remove', label: '이미지 삭제', onSelect: onRemove },
        { key: 'cancel', label: '취소', onSelect: () => undefined },
      ]}
      renderTrigger={renderTrigger}
    />
  );
}

export function ProfileEditImageFields({
  avatar,
  disabled = false,
  header,
  onAvatarEdit,
  onAvatarRemove,
  onAvatarRetry,
  onHeaderEdit,
  onHeaderRemove,
  onHeaderRetry,
}: ProfileEditImageFieldsProps) {
  const theme = useTheme();
  const headerActionDisabled = disabled || !onHeaderEdit;
  const avatarActionDisabled = disabled || !onAvatarEdit;

  return (
    <View style={styles.root}>
      <ImageEditControl
        accessibilityLabel="헤더 이미지 변경"
        disabled={headerActionDisabled}
        draft={header}
        onEdit={onHeaderEdit}
        onRemove={onHeaderRemove}
        style={[styles.headerPreview, { backgroundColor: theme.surface }]}
        testID="profile-edit-header-preview"
      />

      <View style={styles.avatarRow}>
        <ImageEditControl
          accessibilityLabel="아바타 이미지 편집"
          disabled={avatarActionDisabled}
          draft={avatar}
          onEdit={onAvatarEdit}
          onRemove={onAvatarRemove}
          style={[
            styles.avatarPreview,
            { backgroundColor: theme.surface, borderColor: theme.background },
          ]}
          testID="profile-edit-avatar-preview"
        />
      </View>

      <View style={styles.statuses}>
        <ImageStatus
          subject="헤더 이미지"
          onRetry={onHeaderRetry}
          status={getImageFieldStatus('헤더 이미지', header)}
        />
        <ImageStatus
          subject="아바타 이미지"
          onRetry={onAvatarRetry}
          status={getImageFieldStatus('아바타 이미지', avatar)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  headerPreview: {
    aspectRatio: 3,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  imagePlaceholder: {
    bottom: 0,
    left: 0,
    opacity: 0.55,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cameraAffordance: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    pointerEvents: 'none',
    position: 'absolute',
    top: '50%',
    width: 40,
  },
  cameraScrim: {
    backgroundColor: colors.dark.background,
    borderRadius: radii.full,
    opacity: 0.56,
  },
  pressedVeil: {
    backgroundColor: colors.dark.background,
    opacity: 0.16,
    pointerEvents: 'none',
  },
  avatarRow: {
    minHeight: 60,
    paddingHorizontal: spacing.lg,
  },
  avatarPreview: {
    borderRadius: radii.full,
    borderWidth: 4,
    height: 96,
    marginTop: -48,
    overflow: 'hidden',
    position: 'relative',
    width: 96,
  },
  statuses: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  status: {
    flex: 1,
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  retry: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
});
