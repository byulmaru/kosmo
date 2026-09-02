import { FlagIcon, PenIcon, RefreshCwIcon, XIcon } from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ComposerMediaItem } from './PostComposerMediaControls';

type PostComposerMediaEditTool = 'alt' | 'sensitive';

export type PostComposerMediaItemsTargetProps = {
  readonly disabled: boolean;
  readonly media: readonly ComposerMediaItem[];
  readonly onEdit: (key: string, tool: PostComposerMediaEditTool) => void;
  readonly onRemove: (key: string) => void;
  readonly onRetry: (item: ComposerMediaItem) => void;
  readonly sensitiveMedia: boolean;
};

const itemSize = 156;
const actionVisualSize = 32;
const statusVisualHeight = 28;
const statusTargetHeight = Platform.select({ android: 48, ios: 44, default: statusVisualHeight });

export function PostComposerMediaItemsTarget({
  disabled,
  media,
  onEdit,
  onRemove,
  onRetry,
  sensitiveMedia,
}: PostComposerMediaItemsTargetProps) {
  const theme = useTheme();

  if (media.length === 0) {
    return null;
  }

  return (
    <ScrollView
      accessibilityLabel={`첨부 이미지 갤러리, ${media.length}개`}
      contentContainerStyle={styles.galleryContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.gallery}
    >
      {media.map((item, index) => {
        const itemNumber = index + 1;
        const ready = item.state === 'ready';
        const failed = item.state === 'failed';

        return (
          <View
            accessibilityLabel={`첨부 이미지 ${itemNumber}, ${
              item.state === 'uploading' ? '업로드 중' : ready ? '업로드 완료' : '업로드 실패'
            }`}
            key={item.key}
            style={[
              styles.item,
              {
                backgroundColor: failed ? theme.feedbackDangerSubtle : theme.backgroundElevated,
                borderColor: failed ? theme.feedbackDangerBorder : theme.borderSubtle,
              },
            ]}
          >
            {ready ? (
              <Pressable
                accessibilityLabel={`첨부 이미지 ${itemNumber} 대체 텍스트 편집`}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => onEdit(item.key, 'alt')}
                style={({ pressed }) => [styles.previewTarget, pressed && styles.pressed]}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`첨부 이미지 ${itemNumber} 미리보기`}
                  accessibilityRole="image"
                  source={{ uri: item.asset.uri }}
                  style={styles.preview}
                />
              </Pressable>
            ) : (
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel={`첨부 이미지 ${itemNumber} 미리보기`}
                accessibilityRole="image"
                source={{ uri: item.asset.uri }}
                style={[styles.preview, styles.pendingPreview]}
              />
            )}

            <IconButton
              accessibilityLabel={`첨부 이미지 ${itemNumber} 제거`}
              disabled={disabled}
              feedback="opacity"
              onPress={() => onRemove(item.key)}
              style={styles.removeAction}
              visualSize={actionVisualSize}
              visualStyle={[
                styles.actionVisual,
                { backgroundColor: theme.backgroundSurface, borderColor: theme.borderSubtle },
              ]}
            >
              <XIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
            </IconButton>

            {ready ? (
              <IconButton
                accessibilityLabel={`첨부 이미지 ${itemNumber} 편집`}
                disabled={disabled}
                feedback="opacity"
                onPress={() => onEdit(item.key, 'alt')}
                style={styles.editAction}
                visualSize={actionVisualSize}
                visualStyle={[
                  styles.actionVisual,
                  { backgroundColor: theme.backgroundSurface, borderColor: theme.borderSubtle },
                ]}
              >
                <PenIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
              </IconButton>
            ) : item.state === 'uploading' ? (
              <View
                style={[styles.uploadingIndicator, { backgroundColor: theme.backgroundSurface }]}
              >
                <ActivityIndicator
                  accessibilityLabel={`첨부 이미지 ${itemNumber} 업로드 중`}
                  color={theme.foregroundPrimary}
                />
              </View>
            ) : (
              <IconButton
                accessibilityLabel={`${itemNumber}번째 이미지 업로드 다시 시도`}
                disabled={disabled}
                feedback="opacity"
                onPress={() => onRetry(item)}
                style={styles.retryAction}
                visualSize={actionVisualSize}
                visualStyle={[
                  styles.actionVisual,
                  { backgroundColor: theme.backgroundSurface, borderColor: theme.borderSubtle },
                ]}
              >
                <RefreshCwIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
              </IconButton>
            )}

            {ready && (item.altText.trim() || sensitiveMedia) ? (
              <View style={styles.statuses}>
                {item.altText.trim() ? (
                  <StatusButton
                    accessibilityLabel={`첨부 이미지 ${itemNumber} ALT 편집`}
                    disabled={disabled}
                    onPress={() => onEdit(item.key, 'alt')}
                  >
                    <Text style={[styles.statusText, { color: theme.foregroundPrimary }]}>ALT</Text>
                  </StatusButton>
                ) : null}
                {sensitiveMedia ? (
                  <StatusButton
                    accessibilityLabel={`첨부 이미지 ${itemNumber} 민감한 이미지 설정 편집`}
                    disabled={disabled}
                    onPress={() => onEdit(item.key, 'sensitive')}
                  >
                    <FlagIcon color={theme.foregroundPrimary} size={iconSizes[16]} />
                    <Text style={[styles.statusText, { color: theme.foregroundPrimary }]}>
                      민감
                    </Text>
                  </StatusButton>
                ) : null}
              </View>
            ) : null}

            {failed ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.failureBadge,
                  {
                    backgroundColor: theme.feedbackDangerSubtle,
                    borderColor: theme.feedbackDangerBorder,
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: theme.feedbackDangerOnSubtle }]}>
                  업로드 실패
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function StatusButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly children: React.ReactNode;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusTarget,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[
          styles.statusVisual,
          { backgroundColor: theme.backgroundSurface, borderColor: theme.borderSubtle },
        ]}
      >
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gallery: { height: itemSize, width: '100%' },
  galleryContent: { gap: space[8] },
  item: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    height: itemSize,
    overflow: 'hidden',
    position: 'relative',
    width: itemSize,
  },
  previewTarget: { height: '100%', width: '100%' },
  preview: { height: '100%', width: '100%' },
  pendingPreview: { opacity: 0.18 },
  pressed: { opacity: 0.84 },
  actionVisual: {
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
  },
  removeAction: { left: space[4], position: 'absolute', top: space[4], zIndex: 2 },
  editAction: { position: 'absolute', right: space[4], top: space[4], zIndex: 2 },
  uploadingIndicator: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: space[48],
    justifyContent: 'center',
    left: '50%',
    marginLeft: -space[24],
    marginTop: -space[24],
    position: 'absolute',
    top: '50%',
    width: space[48],
  },
  retryAction: {
    left: '50%',
    marginLeft: -actionVisualSize / 2,
    marginTop: -actionVisualSize / 2,
    position: 'absolute',
    top: '50%',
  },
  statuses: {
    alignItems: 'center',
    bottom: space[4],
    flexDirection: 'row',
    gap: space[4],
    left: space[4],
    position: 'absolute',
  },
  statusTarget: {
    alignItems: 'center',
    height: statusTargetHeight,
    justifyContent: 'center',
  },
  statusVisual: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[4],
    height: statusVisualHeight,
    justifyContent: 'center',
    paddingHorizontal: space[8],
  },
  statusText: textStyles.uiCopyM,
  failureBadge: {
    borderRadius: radius.full,
    borderWidth: borderWidths[1],
    bottom: space[4],
    height: statusVisualHeight,
    justifyContent: 'center',
    left: space[4],
    paddingHorizontal: space[8],
    position: 'absolute',
  },
});
