import { Camera } from 'lucide-react-native';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  formatImageUploadFailureMessage,
  formatImageUploadRetryLabel,
} from '@/components/media/imageUploadErrors';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, iconSizes, radius, space, textStyles } from '@/theme/tokens';
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
          {
            color:
              status.kind === 'error' ? theme.feedbackDangerOnSubtle : theme.feedbackInfoOnSubtle,
          },
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
          <Text style={[styles.retryLabel, { color: theme.foregroundPrimary }]}>다시 시도</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CameraAffordance({ disabled }: { disabled: boolean }) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.cameraAffordance, { opacity: disabled ? 0.45 : 1 }]}
      testID="profile-edit-camera-affordance"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.cameraScrim,
          { backgroundColor: theme.overlayScrim },
        ]}
      />
      <Camera color={theme.fixedWhite} size={iconSizes[20]} strokeWidth={2} />
    </View>
  );
}

function ImageEditControl({
  accessibilityLabel,
  disabled,
  draft,
  innerBorderColor,
  onEdit,
  onRemove,
  style,
  testID,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  draft: ProfileEditImageDraft;
  innerBorderColor?: string;
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
              testID={`${testID}-content`}
            />
          ) : (
            <View
              style={[styles.imagePlaceholder, { backgroundColor: theme.actionPrimarySubtle }]}
              testID={`${testID}-content`}
            />
          )}
          {innerBorderColor ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.innerBorder,
                { borderColor: innerBorderColor },
              ]}
              testID={`${testID}-inner-border`}
            />
          ) : null}
          {pressed ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.pressedVeil,
                { backgroundColor: theme.overlayScrim },
              ]}
            />
          ) : null}
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
  const { width } = useWindowDimensions();
  const mobile = Platform.OS !== 'web' || width < breakpoints.compact;
  const avatarFrameSize = mobile ? 96 : 128;

  return (
    <View style={styles.root}>
      <ImageEditControl
        accessibilityLabel="헤더 이미지 변경"
        disabled={disabled || !onHeaderEdit}
        draft={header}
        onEdit={onHeaderEdit}
        onRemove={onHeaderRemove}
        style={[
          styles.headerPreview,
          { backgroundColor: theme.actionPrimarySubtle, borderColor: theme.borderDefault },
        ]}
        testID="profile-edit-header-preview"
      />

      <View
        style={[styles.avatarRow, { minHeight: mobile ? 64 : 80 }]}
        testID="profile-edit-avatar-row"
      >
        <ImageEditControl
          accessibilityLabel="아바타 이미지 편집"
          disabled={disabled || !onAvatarEdit}
          draft={avatar}
          innerBorderColor={theme.borderDefault}
          onEdit={onAvatarEdit}
          onRemove={onAvatarRemove}
          style={[
            styles.avatarPreview,
            {
              height: avatarFrameSize,
              marginTop: -avatarFrameSize / 2,
              width: avatarFrameSize,
            },
            { backgroundColor: theme.backgroundSurface, borderColor: theme.backgroundCanvas },
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
    borderBottomWidth: borderWidths[1],
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
  innerBorder: {
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
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
    borderRadius: radius.full,
  },
  pressedVeil: {
    opacity: 0.16,
    pointerEvents: 'none',
  },
  avatarRow: {
    paddingHorizontal: space[16],
  },
  avatarPreview: {
    borderRadius: radius.full,
    borderWidth: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  statuses: {
    gap: space[4],
    paddingHorizontal: space[16],
  },
  status: {
    flex: 1,
    ...textStyles.uiCopyS,
  },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  retry: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space[8] },
  retryLabel: textStyles.uiLabelS,
});
