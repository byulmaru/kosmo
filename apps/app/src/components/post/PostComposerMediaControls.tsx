import * as ImagePicker from 'expo-image-picker';
import { ImagePlusIcon, RefreshCwIcon, XIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import {
  createClipboardMediaAsset,
  getClipboardImageFiles,
  postComposerMediaLimit,
  releaseComposerMediaPreview,
  takeAvailableComposerMedia,
  uploadComposerMedia,
} from './postComposerMedia';
import type { ReactNode, RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { PostComposerCompleteMediaUploadMutation } from './__generated__/PostComposerCompleteMediaUploadMutation.graphql';
import type { PostComposerIssueMediaUploadUrlMutation } from './__generated__/PostComposerIssueMediaUploadUrlMutation.graphql';

export type ComposerMediaItem = {
  readonly asset: ImagePicker.ImagePickerAsset;
  readonly key: string;
  readonly mediaId?: string;
  readonly state: 'uploading' | 'ready' | 'failed';
  readonly altText: string;
};

export type PostComposerMediaValue = {
  readonly hasPendingMedia: boolean;
  readonly items: readonly {
    readonly altText: string | null;
    readonly mediaId: string;
  }[];
  readonly sensitiveMedia: boolean;
};

export const emptyPostComposerMediaValue: PostComposerMediaValue = {
  hasPendingMedia: false,
  items: [],
  sensitiveMedia: false,
};

export function PostComposerMediaControls({
  actions,
  disabled,
  editorRef,
  onValueChange,
}: {
  readonly actions: ReactNode;
  readonly disabled: boolean;
  readonly editorRef: RefObject<TextInput | null>;
  readonly onValueChange: (value: PostComposerMediaValue) => void;
}) {
  const theme = useTheme();
  const [media, setMedia] = useState<ComposerMediaItem[]>([]);
  const mediaRef = useRef<readonly ComposerMediaItem[]>(media);
  const [sensitiveMedia, setSensitiveMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const removedMediaKeys = useRef(new Set<string>());
  const selectingMedia = useRef(false);
  const nextMediaKey = useRef(0);
  const [commitIssueMediaUploadUrl] = useMutation<PostComposerIssueMediaUploadUrlMutation>(graphql`
    mutation PostComposerIssueMediaUploadUrlMutation {
      issueMediaUploadUrl {
        media {
          id
        }
        uploadUrl
      }
    }
  `);
  const [commitCompleteMediaUpload] = useMutation<PostComposerCompleteMediaUploadMutation>(graphql`
    mutation PostComposerCompleteMediaUploadMutation($input: CompleteMediaUploadInput!) {
      completeMediaUpload(input: $input) {
        media {
          id
          state
        }
      }
    }
  `);

  const updateMedia = (
    update: (items: readonly ComposerMediaItem[]) => readonly ComposerMediaItem[],
  ) => {
    const next = [...update(mediaRef.current)];
    mediaRef.current = next;
    setMedia(next);
  };

  const uploadMedia = async (key: string, asset: ImagePicker.ImagePickerAsset) => {
    updateMedia((items) =>
      items.map((item) => (item.key === key ? { ...item, state: 'uploading' } : item)),
    );

    try {
      const mediaId = await uploadComposerMedia({
        complete: (id) =>
          new Promise<void>((resolve, reject) => {
            commitCompleteMediaUpload({
              variables: { input: { id } },
              onCompleted: (response, errors) => {
                if (errors?.length || response.completeMediaUpload.media.state !== 'READY') {
                  reject(new Error('이미지 업로드를 완료하지 못했습니다.'));
                  return;
                }
                resolve();
              },
              onError: reject,
            });
          }),
        isActive: () => mounted.current && !removedMediaKeys.current.has(key),
        issue: () =>
          new Promise((resolve, reject) => {
            commitIssueMediaUploadUrl({
              variables: {},
              onCompleted: (response, errors) => {
                if (errors?.length) {
                  reject(new Error('이미지 업로드를 시작하지 못했습니다.'));
                  return;
                }
                resolve({
                  mediaId: response.issueMediaUploadUrl.media.id,
                  uploadUrl: response.issueMediaUploadUrl.uploadUrl,
                });
              },
              onError: reject,
            });
          }),
        put: async (uploadUrl) => {
          const body = asset.file ?? (await (await fetch(asset.uri)).blob());
          const uploaded = await fetch(uploadUrl, {
            body,
            headers: asset.mimeType ? { 'content-type': asset.mimeType } : undefined,
            method: 'PUT',
          });
          if (!uploaded.ok) {
            throw new Error('이미지 전송에 실패했습니다.');
          }
        },
      });
      if (mediaId === null) {
        return;
      }
      updateMedia((items) =>
        items.map((item) => (item.key === key ? { ...item, mediaId, state: 'ready' } : item)),
      );
    } catch {
      if (!mounted.current || removedMediaKeys.current.has(key)) {
        return;
      }
      updateMedia((items) =>
        items.map((item) => (item.key === key ? { ...item, state: 'failed' } : item)),
      );
    }
  };

  const addMediaAssets = (assets: readonly ImagePicker.ImagePickerAsset[]) => {
    if (!mounted.current || disabled) {
      return;
    }

    const selected = takeAvailableComposerMedia(assets, mediaRef.current.length).map((asset) => ({
      altText: '',
      asset,
      key: `composer-media-${++nextMediaKey.current}`,
      state: 'uploading' as const,
    }));
    if (selected.length === 0) {
      return;
    }

    setError(null);
    updateMedia((items) => [...items, ...selected]);
    for (const item of selected) {
      void uploadMedia(item.key, item.asset);
    }
  };

  const addClipboardMediaFiles = (files: readonly File[]) => {
    if (!mounted.current || disabled) {
      return;
    }

    const selected = takeAvailableComposerMedia(files, mediaRef.current.length);
    if (selected.length === 0) {
      return;
    }

    addMediaAssets(selected.map((file) => createClipboardMediaAsset(file)));
  };

  const addClipboardMediaFilesRef = useRef(addClipboardMediaFiles);
  addClipboardMediaFilesRef.current = addClipboardMediaFiles;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const editor = editorRef.current as unknown as HTMLElement | null;
    if (!editor) {
      return;
    }

    const onPaste = (event: ClipboardEvent) => {
      const files = getClipboardImageFiles(
        event.clipboardData ? Array.from(event.clipboardData.items) : null,
      );
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      addClipboardMediaFilesRef.current(files);
    };

    editor.addEventListener('paste', onPaste);
    return () => editor.removeEventListener('paste', onPaste);
  }, [editorRef]);

  const selectMedia = async () => {
    const availableAtOpen = postComposerMediaLimit - mediaRef.current.length;
    if (availableAtOpen <= 0 || disabled || selectingMedia.current) {
      return;
    }
    selectingMedia.current = true;
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        selectionLimit: availableAtOpen,
      });
      if (!mounted.current || result.canceled) {
        return;
      }

      addMediaAssets(takeAvailableComposerMedia(result.assets, mediaRef.current.length));
    } catch {
      if (mounted.current) {
        setError('이미지를 선택하지 못했습니다.');
      }
    } finally {
      selectingMedia.current = false;
    }
  };

  const removeMedia = (key: string) => {
    removedMediaKeys.current.add(key);
    const removed = mediaRef.current.find((item) => item.key === key);
    if (Platform.OS === 'web' && removed) {
      releaseComposerMediaPreview(removed.asset.uri);
    }
    updateMedia((items) => items.filter((item) => item.key !== key));
    if (mediaRef.current.length === 0) {
      setSensitiveMedia(false);
    }
  };

  useEffect(() => {
    onValueChange({
      hasPendingMedia: media.some((item) => item.state !== 'ready'),
      items: media.flatMap((item) =>
        item.state === 'ready' && item.mediaId
          ? [{ altText: item.altText.trim() || null, mediaId: item.mediaId }]
          : [],
      ),
      sensitiveMedia: media.length > 0 ? sensitiveMedia : false,
    });
  }, [media, onValueChange, sensitiveMedia]);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      for (const item of mediaRef.current) {
        removedMediaKeys.current.add(item.key);
        if (Platform.OS === 'web') {
          releaseComposerMediaPreview(item.asset.uri);
        }
      }
    };
  }, []);

  return (
    <>
      <PostComposerMediaItems
        disabled={disabled}
        media={media}
        onAltTextChange={(key, altText) =>
          updateMedia((items) =>
            items.map((item) => (item.key === key ? { ...item, altText } : item)),
          )
        }
        onRemove={removeMedia}
        onRetry={(item) => void uploadMedia(item.key, item.asset)}
        onSensitiveMediaChange={setSensitiveMedia}
        sensitiveMedia={sensitiveMedia}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Pressable
          accessibilityLabel={`이미지 추가, ${postComposerMediaLimit - media.length}개 더 선택 가능`}
          accessibilityRole="button"
          accessibilityState={{ disabled: disabled || media.length >= postComposerMediaLimit }}
          disabled={disabled || media.length >= postComposerMediaLimit}
          hitSlop={4}
          onPress={() => void selectMedia()}
          style={({ pressed }) => [
            styles.addMedia,
            {
              backgroundColor: pressed ? theme.surface : 'transparent',
              opacity: disabled || media.length >= postComposerMediaLimit ? 0.45 : 1,
            },
          ]}
        >
          <ImagePlusIcon color={theme.primary} size={24} />
        </Pressable>
        {actions}
      </View>
    </>
  );
}

export function PostComposerMediaItems({
  disabled,
  media,
  onAltTextChange,
  onRemove,
  onRetry,
  onSensitiveMediaChange,
  sensitiveMedia,
}: {
  readonly disabled: boolean;
  readonly media: readonly ComposerMediaItem[];
  readonly onAltTextChange: (key: string, altText: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onRetry: (item: ComposerMediaItem) => void;
  readonly onSensitiveMediaChange: (value: boolean) => void;
  readonly sensitiveMedia: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.mediaSection}>
      {media.map((item, index) => (
        <View
          accessibilityLabel={`첨부 이미지 ${index + 1}, ${
            item.state === 'uploading'
              ? '업로드 중'
              : item.state === 'ready'
                ? '업로드 완료'
                : '업로드 실패'
          }`}
          accessibilityLiveRegion="polite"
          key={item.key}
          style={styles.mediaItem}
        >
          <View style={styles.mediaPreviewContainer}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={`첨부 이미지 ${index + 1} 미리보기`}
              accessibilityRole="image"
              source={{ uri: item.asset.uri }}
              style={styles.mediaPreview}
            />
            {item.state !== 'ready' ? (
              <>
                <View style={[StyleSheet.absoluteFill, styles.mediaOverlayBackdrop]} />
                {item.state === 'uploading' ? (
                  <View style={[StyleSheet.absoluteFill, styles.mediaOverlay]}>
                    <ActivityIndicator
                      accessibilityLabel={`첨부 이미지 ${index + 1} 업로드 중`}
                      color={colors.light.background}
                    />
                  </View>
                ) : (
                  <Pressable
                    accessibilityLabel={`첨부 이미지 ${index + 1} 업로드 재시도`}
                    accessibilityRole="button"
                    onPress={() => onRetry(item)}
                    style={[StyleSheet.absoluteFill, styles.mediaOverlay]}
                  >
                    <RefreshCwIcon color={colors.light.background} size={24} />
                  </Pressable>
                )}
              </>
            ) : null}
            <Pressable
              accessibilityLabel={`첨부 이미지 ${index + 1} 제거`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              hitSlop={8}
              onPress={() => onRemove(item.key)}
              style={({ pressed }) => [
                styles.mediaRemove,
                { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
              ]}
            >
              <XIcon color={colors.light.background} size={18} />
            </Pressable>
          </View>
          {item.state === 'ready' ? (
            <View style={styles.mediaItemBody}>
              <TextField
                accessibilityLabel={`첨부 이미지 ${index + 1} 대체 텍스트`}
                editable={!disabled}
                label="대체 텍스트 (선택)"
                onChangeText={(altText) => onAltTextChange(item.key, altText)}
                value={item.altText}
              />
            </View>
          ) : null}
        </View>
      ))}
      {media.length > 0 ? (
        <View style={styles.sensitiveMedia}>
          <View style={styles.sensitiveMediaCopy}>
            <Text style={[styles.sensitiveMediaLabel, { color: theme.text }]}>민감한 이미지</Text>
            <Text style={[styles.sensitiveMediaDescription, { color: theme.textSecondary }]}>
              이미지를 기본적으로 가려서 표시합니다.
            </Text>
          </View>
          <Switch
            accessibilityLabel="민감한 이미지로 표시"
            accessibilityState={{ checked: sensitiveMedia, disabled }}
            disabled={disabled}
            onValueChange={onSensitiveMediaChange}
            value={sensitiveMedia}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mediaSection: { gap: spacing.md },
  error: { fontFamily: 'SUIT', ...typography.sm },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  addMedia: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  mediaItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  mediaPreviewContainer: {
    borderRadius: radii.sm,
    height: 96,
    overflow: 'hidden',
    position: 'relative',
    width: 96,
  },
  mediaPreview: { height: 96, width: 96 },
  mediaOverlayBackdrop: { backgroundColor: colors.light.text, opacity: 0.58 },
  mediaOverlay: { alignItems: 'center', justifyContent: 'center' },
  mediaRemove: {
    alignItems: 'center',
    backgroundColor: colors.light.text,
    borderRadius: radii.full,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 32,
    zIndex: 1,
  },
  mediaItemBody: { flex: 1 },
  sensitiveMedia: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sensitiveMediaCopy: { flex: 1, gap: spacing.xs },
  sensitiveMediaLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  sensitiveMediaDescription: { fontFamily: 'SUIT', ...typography.xsm },
});
