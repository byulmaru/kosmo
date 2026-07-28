import { Pencil } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
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
      message: draft.error ?? `${label} 이미지를 준비하지 못했어요.`,
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
      <View
        testID="profile-edit-header-preview"
        style={[styles.headerPreview, { backgroundColor: theme.surface }]}
      >
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
        <Pressable
          accessibilityLabel="헤더 이미지 변경"
          accessibilityRole="button"
          accessibilityState={{ disabled: headerActionDisabled }}
          disabled={headerActionDisabled}
          onPress={onHeaderEdit}
          style={({ pressed }) => [
            styles.imageAction,
            styles.headerAction,
            {
              backgroundColor: theme.accent,
              opacity: headerActionDisabled ? 0.45 : pressed ? 0.75 : 1,
            },
          ]}
        >
          <Pencil color={theme.background} size={18} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.avatarRow}>
        <View
          testID="profile-edit-avatar-preview"
          style={[
            styles.avatarPreview,
            { backgroundColor: theme.surface, borderColor: theme.background },
          ]}
        >
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
          <Pressable
            accessibilityLabel="아바타 이미지 편집"
            accessibilityRole="button"
            accessibilityState={{ disabled: avatarActionDisabled }}
            disabled={avatarActionDisabled}
            onPress={onAvatarEdit}
            style={({ pressed }) => [
              styles.imageAction,
              styles.avatarAction,
              {
                backgroundColor: theme.accent,
                opacity: avatarActionDisabled ? 0.45 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Pencil color={theme.background} size={18} strokeWidth={2} />
          </Pressable>
        </View>
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
  imageAction: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    width: 44,
  },
  headerAction: {
    borderRadius: radii.full,
    bottom: spacing.md,
    right: spacing.md,
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
  avatarAction: {
    borderRadius: radii.full,
    bottom: 0,
    right: 0,
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
