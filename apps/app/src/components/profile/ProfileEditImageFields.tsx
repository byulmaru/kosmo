import { Camera } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import type { ProfileEditImageDraft } from './profileEditState';

type ProfileEditImageFieldsProps = {
  avatar: ProfileEditImageDraft;
  disabled?: boolean;
  header: ProfileEditImageDraft;
  onAvatarEdit?: () => void;
  onHeaderEdit?: () => void;
};

type ImageFieldStatus = {
  kind: 'info' | 'error';
  message: string;
};

function getImageFieldStatus(
  label: '아바타' | '헤더',
  draft: ProfileEditImageDraft,
): ImageFieldStatus | null {
  if (draft.kind === 'removed') {
    return { kind: 'info', message: `${label} 이미지가 제거됩니다.` };
  }

  if (draft.kind !== 'replacement') {
    return null;
  }

  if (draft.uploadState === 'uploading') {
    return { kind: 'info', message: `${label} 이미지 업로드를 기다리고 있어요.` };
  }

  if (draft.uploadState === 'error') {
    return {
      kind: 'error',
      message: `${label} 이미지 업로드에 실패했어요. 다시 시도해 주세요.`,
    };
  }

  return { kind: 'info', message: `새 ${label} 이미지가 선택됐어요.` };
}

function ImageStatus({ status }: { status: ImageFieldStatus | null }) {
  const theme = useTheme();

  if (!status) {
    return null;
  }

  return (
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

export function ProfileEditImageFields({
  avatar,
  disabled = false,
  header,
  onAvatarEdit,
  onHeaderEdit,
}: ProfileEditImageFieldsProps) {
  const theme = useTheme();
  const headerActionDisabled = disabled || !onHeaderEdit;
  const avatarActionDisabled = disabled || !onAvatarEdit;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel="헤더 이미지 변경"
        accessibilityRole="button"
        accessibilityState={{ disabled: headerActionDisabled }}
        disabled={headerActionDisabled}
        onPress={onHeaderEdit}
        style={[styles.headerPreview, { backgroundColor: theme.surface }]}
        testID="profile-edit-header-preview"
      >
        {({ pressed }) => (
          <>
            {header.previewUri ? (
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="cover"
                source={{ uri: header.previewUri }}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: theme.primary }]} />
            )}
            {pressed ? <View style={[StyleSheet.absoluteFill, styles.pressedVeil]} /> : null}
            <CameraAffordance disabled={headerActionDisabled} />
          </>
        )}
      </Pressable>

      <View style={styles.avatarRow}>
        <Pressable
          accessibilityLabel="아바타 이미지 편집"
          accessibilityRole="button"
          accessibilityState={{ disabled: avatarActionDisabled }}
          disabled={avatarActionDisabled}
          onPress={onAvatarEdit}
          style={[
            styles.avatarPreview,
            { backgroundColor: theme.surface, borderColor: theme.background },
          ]}
          testID="profile-edit-avatar-preview"
        >
          {({ pressed }) => (
            <>
              {avatar.previewUri ? (
                <Image
                  accessibilityIgnoresInvertColors
                  resizeMode="cover"
                  source={{ uri: avatar.previewUri }}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <View style={[styles.imagePlaceholder, { backgroundColor: theme.primary }]} />
              )}
              {pressed ? <View style={[StyleSheet.absoluteFill, styles.pressedVeil]} /> : null}
              <CameraAffordance disabled={avatarActionDisabled} />
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.statuses}>
        <ImageStatus status={getImageFieldStatus('헤더', header)} />
        <ImageStatus status={getImageFieldStatus('아바타', avatar)} />
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
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
});
