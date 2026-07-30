import { PostVisibility } from '@kosmo/core/enums';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import * as ImagePicker from 'expo-image-picker';
import {
  AtSignIcon,
  GlobeIcon,
  ImagePlusIcon,
  LockIcon,
  MoonIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { postComposerMediaLimit, uploadComposerMedia } from './postComposerMedia';
import type { TextInput } from 'react-native';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCompleteMediaUploadMutation } from './__generated__/PostComposerCompleteMediaUploadMutation.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';
import type { PostComposerIssueMediaUploadUrlMutation } from './__generated__/PostComposerIssueMediaUploadUrlMutation.graphql';

const visibilityOptions = [
  {
    description: '모두가 볼 수 있어요.',
    icon: GlobeIcon,
    label: '공개',
    value: PostVisibility.PUBLIC,
  },
  {
    description: '모두가 볼 수 있지만 검색되지 않아요.',
    icon: MoonIcon,
    label: '조용한 공개',
    value: PostVisibility.UNLISTED,
  },
  {
    description: '팔로워만 볼 수 있어요.',
    icon: LockIcon,
    label: '팔로워만',
    value: PostVisibility.FOLLOWERS,
  },
  {
    description: '이 글에서 언급한 계정만 볼 수 있어요.',
    icon: AtSignIcon,
    label: '언급한 계정만',
    value: PostVisibility.DIRECT,
  },
] as const;
type Visibility = (typeof visibilityOptions)[number]['value'];

export type ComposerMediaItem = {
  readonly asset: ImagePicker.ImagePickerAsset;
  readonly key: string;
  readonly mediaId?: string;
  readonly state: 'uploading' | 'ready' | 'failed';
  readonly uploadError?: string;
  readonly altText: string;
};

const PostComposerFragment = graphql`
  fragment PostComposer_profile on Profile {
    id
    displayName
    handle
    ...ProfileNameBlock_profile
  }
`;

const CreatePostMutation = graphql`
  mutation PostComposerCreatePostMutation($input: CreatePostInput!) {
    createPost(input: $input) {
      post {
        id
      }
    }
  }
`;

const IssueMediaUploadUrlMutation = graphql`
  mutation PostComposerIssueMediaUploadUrlMutation {
    issueMediaUploadUrl {
      media {
        id
      }
      uploadUrl
    }
  }
`;

const CompleteMediaUploadMutation = graphql`
  mutation PostComposerCompleteMediaUploadMutation($input: CompleteMediaUploadInput!) {
    completeMediaUpload(input: $input) {
      media {
        id
        state
      }
    }
  }
`;

export function PostComposer({ profile: profileKey }: { profile: PostComposer_profile$key }) {
  const theme = useTheme();
  const profile = useFragment(PostComposerFragment, profileKey);
  const editor = useRef<TextInput>(null);
  const visibilityControl = useRef<View>(null);
  const visibilityMenuRef = useRef<View>(null);
  const visibilityTrigger = useRef<View>(null);
  const [body, setBody] = useState('');
  const [editorFocused, setEditorFocused] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(PostVisibility.UNLISTED);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<ComposerMediaItem[]>([]);
  const [sensitiveMedia, setSensitiveMedia] = useState(false);
  const removedMediaKeys = useRef(new Set<string>());
  const nextMediaKey = useRef(0);
  const [commit, submitting] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const [commitIssueMediaUploadUrl] = useMutation<PostComposerIssueMediaUploadUrlMutation>(
    IssueMediaUploadUrlMutation,
  );
  const [commitCompleteMediaUpload] = useMutation<PostComposerCompleteMediaUploadMutation>(
    CompleteMediaUploadMutation,
  );
  const bodyText = normalizePostContentPlainText(body);
  const remaining = postBodyMaxLength - bodyText.length;
  const hasPendingMedia = media.some((item) => item.state !== 'ready');
  const readyMedia = media.filter(
    (item): item is ComposerMediaItem & { readonly mediaId: string; readonly state: 'ready' } =>
      item.state === 'ready' && typeof item.mediaId === 'string',
  );
  const disabled =
    submitting ||
    (bodyText.length === 0 && readyMedia.length === 0) ||
    hasPendingMedia ||
    remaining < 0;
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;

  const issueMediaUploadUrl = () =>
    new Promise<{ mediaId: string; uploadUrl: string }>((resolve, reject) => {
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
    });

  const completeMediaUpload = (mediaId: string) =>
    new Promise<void>((resolve, reject) => {
      commitCompleteMediaUpload({
        variables: { input: { id: mediaId } },
        onCompleted: (response, errors) => {
          if (errors?.length || response.completeMediaUpload.media.state !== 'READY') {
            reject(new Error('이미지 업로드를 완료하지 못했습니다.'));
            return;
          }
          resolve();
        },
        onError: reject,
      });
    });

  const uploadMedia = async (key: string, asset: ImagePicker.ImagePickerAsset) => {
    removedMediaKeys.current.delete(key);
    setMedia((items) =>
      items.map((item) =>
        item.key === key
          ? { ...item, mediaId: undefined, state: 'uploading', uploadError: undefined }
          : item,
      ),
    );

    try {
      const mediaId = await uploadComposerMedia({
        complete: completeMediaUpload,
        isActive: () => !removedMediaKeys.current.has(key),
        issue: issueMediaUploadUrl,
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
      setMedia((items) =>
        items.map((item) =>
          item.key === key ? { ...item, mediaId, state: 'ready', uploadError: undefined } : item,
        ),
      );
    } catch {
      if (removedMediaKeys.current.has(key)) {
        return;
      }
      setMedia((items) =>
        items.map((item) =>
          item.key === key
            ? { ...item, mediaId: undefined, state: 'failed', uploadError: '업로드 실패' }
            : item,
        ),
      );
    }
  };

  const selectMedia = async () => {
    const remainingSlots = postComposerMediaLimit - media.length;
    if (remainingSlots <= 0 || submitting) {
      return;
    }
    setError(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        selectionLimit: remainingSlots,
      });
      if (result.canceled) {
        return;
      }

      const selected = result.assets.slice(0, remainingSlots).map((asset) => ({
        altText: '',
        asset,
        key: `composer-media-${++nextMediaKey.current}`,
        state: 'uploading' as const,
      }));
      setMedia((items) => [...items, ...selected]);
      for (const item of selected) {
        void uploadMedia(item.key, item.asset);
      }
    } catch {
      setError('이미지를 선택하지 못했습니다.');
    }
  };

  const removeMedia = (key: string) => {
    removedMediaKeys.current.add(key);
    setMedia((items) => {
      const next = items.filter((item) => item.key !== key);
      if (next.length === 0) {
        setSensitiveMedia(false);
      }
      return next;
    });
  };

  const submit = () => {
    if (disabled) {
      return;
    }
    setError(null);
    commit({
      variables: {
        input: {
          bodyText,
          media: readyMedia.map((item) => ({
            altText: item.altText.trim() || null,
            mediaId: item.mediaId,
          })),
          sensitiveMedia: media.length > 0 ? sensitiveMedia : false,
          visibility,
        },
      },
      onCompleted: (_response, errors) => {
        if (errors?.length) {
          setError('게시글을 작성하지 못했습니다.');
          return;
        }

        trackAnalytics('post_created', {
          selected_profile_id: profile.id,
          visibility,
        });
        setBody('');
        for (const item of media) {
          removedMediaKeys.current.add(item.key);
        }
        setMedia([]);
        setSensitiveMedia(false);
        setVisibility(PostVisibility.UNLISTED);
        editor.current?.focus();
      },
      onError: (cause) => setError(cause.message || '게시글을 작성하지 못했습니다.'),
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !visibilityOpen) {
      return;
    }

    const control = visibilityControl.current as unknown as HTMLElement | null;
    const menu = visibilityMenuRef.current as unknown as HTMLElement | null;
    const trigger = visibilityTrigger.current as unknown as HTMLElement | null;
    const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);

    (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!control?.contains(event.target as Node)) {
        setVisibilityOpen(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!control?.contains(event.target as Node)) {
        setVisibilityOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setVisibilityOpen(false);
        trigger?.focus();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const index = current ? items.indexOf(current) : -1;

      if (event.key === ' ' && index >= 0) {
        event.preventDefault();
        current?.click();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || items.length === 0) {
        return;
      }

      event.preventDefault();
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (index + 1 + items.length) % items.length
              : (index - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visibilityOpen]);

  const visibilityMenu = (
    <View
      ref={visibilityMenuRef}
      accessibilityLabel="게시글 공개 설정"
      accessibilityRole={Platform.OS === 'web' ? undefined : 'radiogroup'}
      role={Platform.OS === 'web' ? 'menu' : undefined}
      style={[styles.visibilityMenu, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      {visibilityOptions.map((option) => {
        const selected = option.value === visibility;
        const VisibilityIcon = option.icon;
        return (
          <Pressable
            aria-checked={selected}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'radio'}
            accessibilityState={Platform.OS === 'web' ? undefined : { checked: selected }}
            key={option.value}
            onPress={() => {
              setVisibility(option.value);
              setVisibilityOpen(false);
              if (Platform.OS === 'web') {
                requestAnimationFrame(() => {
                  (visibilityTrigger.current as unknown as HTMLElement | null)?.focus();
                });
              }
            }}
            role={Platform.OS === 'web' ? ('menuitemradio' as 'radio') : undefined}
            style={({ pressed }) => [
              styles.visibilityOption,
              {
                backgroundColor: selected
                  ? 'rgba(252, 231, 154, 0.45)'
                  : pressed
                    ? theme.surface
                    : 'transparent',
              },
            ]}
          >
            <VisibilityIcon color={theme.textSecondary} size={16} strokeWidth={2} />
            <View style={styles.visibilityCopy}>
              <Text style={[styles.visibilityLabel, { color: theme.text }]}>{option.label}</Text>
              <Text style={[styles.visibilityDescription, { color: theme.textSecondary }]}>
                {option.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      accessibilityLabel="새 게시글 작성"
      style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <View style={styles.author}>
        <Avatar label={profile.displayName} size={40} />
        <ProfileNameBlock profile={profile} />
      </View>
      <TextArea
        ref={editor}
        aria-invalid={Boolean(error)}
        accessibilityLabel="게시글 본문"
        editable={!submitting}
        onBlur={() => setEditorFocused(false)}
        onChangeText={setBody}
        onFocus={() => setEditorFocused(true)}
        placeholder="무슨 일이 일어나고 있나요?"
        style={{
          backgroundColor: theme.background,
          borderColor: error ? theme.danger : editorFocused ? theme.primary : theme.border,
        }}
        value={body}
      />
      <PostComposerMediaControls
        media={media}
        onAdd={() => void selectMedia()}
        onAltTextChange={(key, altText) =>
          setMedia((items) => items.map((item) => (item.key === key ? { ...item, altText } : item)))
        }
        onRemove={removeMedia}
        onRetry={(item) => void uploadMedia(item.key, item.asset)}
        onSensitiveMediaChange={setSensitiveMedia}
        sensitiveMedia={sensitiveMedia}
        submitting={submitting}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <View
          ref={visibilityControl}
          style={[styles.visibilityControl, { zIndex: visibilityOpen ? 50 : 0 }]}
        >
          <Pressable
            ref={visibilityTrigger}
            aria-expanded={visibilityOpen}
            aria-haspopup="menu"
            accessibilityRole="button"
            onPress={() => setVisibilityOpen(!visibilityOpen)}
            style={({ pressed }) => [
              styles.visibilityTrigger,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: theme.border,
              },
            ]}
          >
            <SelectedVisibilityIcon color={theme.text} size={16} />
            <Text numberOfLines={1} style={[styles.visibilityTriggerLabel, { color: theme.text }]}>
              {selectedVisibility.label}
            </Text>
          </Pressable>
          {Platform.OS === 'web' && visibilityOpen ? (
            <View style={styles.webVisibilityMenu}>{visibilityMenu}</View>
          ) : null}
        </View>
        <View style={styles.submit}>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.remaining,
              { color: remaining < 0 ? theme.danger : theme.textSecondary },
            ]}
          >
            {remaining.toLocaleString('ko-KR')}
          </Text>
          <Button disabled={disabled} loading={submitting} onPress={submit}>
            게시
          </Button>
        </View>
      </View>

      {Platform.OS !== 'web' ? (
        <Modal
          accessibilityLabel="공개 범위"
          animationType="fade"
          onRequestClose={() => setVisibilityOpen(false)}
          role="dialog"
          transparent
          visible={visibilityOpen}
        >
          <Pressable onPress={() => setVisibilityOpen(false)} style={styles.backdrop}>
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={styles.nativeVisibilityMenu}
            >
              {visibilityMenu}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

export function PostComposerMediaControls({
  media,
  onAdd,
  onAltTextChange,
  onRemove,
  onRetry,
  onSensitiveMediaChange,
  sensitiveMedia,
  submitting,
}: {
  readonly media: readonly ComposerMediaItem[];
  readonly onAdd: () => void;
  readonly onAltTextChange: (key: string, altText: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onRetry: (item: ComposerMediaItem) => void;
  readonly onSensitiveMediaChange: (value: boolean) => void;
  readonly sensitiveMedia: boolean;
  readonly submitting: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.mediaSection}>
      <Pressable
        accessibilityLabel={`이미지 추가, ${postComposerMediaLimit - media.length}개 더 선택 가능`}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting || media.length >= postComposerMediaLimit }}
        disabled={submitting || media.length >= postComposerMediaLimit}
        onPress={onAdd}
        style={({ pressed }) => [
          styles.addMedia,
          {
            backgroundColor: pressed ? theme.surface : theme.card,
            borderColor: theme.border,
            opacity: submitting || media.length >= postComposerMediaLimit ? 0.45 : 1,
          },
        ]}
      >
        <ImagePlusIcon color={theme.text} size={20} />
        <Text style={[styles.addMediaLabel, { color: theme.text }]}>이미지 추가</Text>
      </Pressable>
      {media.map((item, index) => (
        <View
          accessibilityLabel={`첨부 이미지 ${index + 1}, ${
            item.state === 'uploading'
              ? '업로드 중'
              : item.state === 'ready'
                ? '업로드 완료'
                : '업로드 실패'
          }`}
          key={item.key}
          style={[styles.mediaItem, { borderColor: theme.border }]}
        >
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={`첨부 이미지 ${index + 1} 미리보기`}
            source={{ uri: item.asset.uri }}
            style={styles.mediaPreview}
          />
          <View style={styles.mediaItemBody}>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.mediaStatus,
                { color: item.state === 'failed' ? theme.danger : theme.textSecondary },
              ]}
            >
              {item.state === 'uploading'
                ? '업로드 중…'
                : item.state === 'ready'
                  ? '업로드 완료'
                  : item.uploadError}
            </Text>
            {item.state === 'ready' ? (
              <TextField
                accessibilityLabel={`첨부 이미지 ${index + 1} 대체 텍스트`}
                editable={!submitting}
                label="대체 텍스트 (선택)"
                onChangeText={(altText) => onAltTextChange(item.key, altText)}
                value={item.altText}
              />
            ) : null}
            <View style={styles.mediaActions}>
              {item.state === 'failed' ? (
                <Pressable
                  accessibilityLabel={`첨부 이미지 ${index + 1} 업로드 재시도`}
                  accessibilityRole="button"
                  onPress={() => onRetry(item)}
                  style={styles.mediaAction}
                >
                  <RefreshCwIcon color={theme.text} size={18} />
                  <Text style={[styles.mediaActionLabel, { color: theme.text }]}>재시도</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={`첨부 이미지 ${index + 1} 제거`}
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => onRemove(item.key)}
                style={styles.mediaAction}
              >
                <Trash2Icon color={theme.danger} size={18} />
                <Text style={[styles.mediaActionLabel, { color: theme.danger }]}>제거</Text>
              </Pressable>
            </View>
          </View>
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
            accessibilityState={{ checked: sensitiveMedia, disabled: submitting }}
            disabled={submitting}
            onValueChange={onSensitiveMediaChange}
            value={sensitiveMedia}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, borderWidth: 1, gap: spacing.lg, padding: spacing.lg },
  author: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  visibilityControl: { position: 'relative' },
  visibilityTrigger: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 40,
    justifyContent: 'center',
    minWidth: 120,
    paddingHorizontal: spacing.lg,
  },
  visibilityTriggerLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  webVisibilityMenu: { left: 0, position: 'absolute', top: 44, width: 256, zIndex: 50 },
  submit: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  remaining: { fontFamily: 'SUIT', ...typography.xsm },
  error: { fontFamily: 'SUIT', ...typography.sm },
  mediaSection: { gap: spacing.md },
  addMedia: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  addMediaLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  mediaItem: {
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  mediaPreview: { borderRadius: radii.sm, height: 96, width: 96 },
  mediaItemBody: { flex: 1, gap: spacing.sm },
  mediaStatus: { fontFamily: 'SUIT', ...typography.sm },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mediaAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  mediaActionLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  sensitiveMedia: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sensitiveMediaCopy: { flex: 1, gap: spacing.xs },
  sensitiveMediaLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  sensitiveMediaDescription: { fontFamily: 'SUIT', ...typography.xsm },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  nativeVisibilityMenu: { width: 256 },
  visibilityMenu: {
    borderRadius: radii.sm,
    borderWidth: 1,
    boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)',
    gap: spacing.xs,
    overflow: 'hidden',
    padding: spacing.xs,
    width: 256,
  },
  visibilityOption: {
    alignItems: 'flex-start',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  visibilityCopy: { flex: 1, gap: spacing.xs },
  visibilityLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  visibilityDescription: { fontFamily: 'SUIT', ...typography.xsm },
});
