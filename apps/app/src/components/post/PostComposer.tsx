import { PostVisibility } from '@kosmo/core/enums';
import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { AtSignIcon, GlobeIcon, LockIcon, MoonIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import {
  createPostComposerContextKey,
  createPostComposerMutationInput,
  isPostComposerVisibilityAllowed,
} from './postComposerState';
import {
  emptyPostComposerMediaValue,
  PostComposerMediaControls,
} from './PostComposerMediaControls';
import type { ReactNode, RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';
import type { PostComposerMediaValue } from './PostComposerMediaControls';

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
export type PostComposerCreatedPost = Readonly<{ id: string }>;
export type PostComposerState = Readonly<{ dirty: boolean; submitting: boolean }>;

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

type PostComposerProps = {
  beforeEditor?: ReactNode;
  editorRef?: RefObject<TextInput | null>;
  focusOnMount?: boolean;
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onStateChange?: (state: PostComposerState) => void;
  profile: PostComposer_profile$key;
  replyParentId?: string;
  scrollable?: boolean;
  surface?: boolean;
};

export function PostComposer({
  beforeEditor,
  editorRef,
  focusOnMount = false,
  onPostCreated,
  onStateChange,
  profile: profileKey,
  replyParentId,
  scrollable = false,
  surface = false,
}: PostComposerProps) {
  const theme = useTheme();
  const profile = useFragment(PostComposerFragment, profileKey);
  const internalEditorRef = useRef<TextInput>(null);
  const editor = editorRef ?? internalEditorRef;
  const visibilityControl = useRef<View>(null);
  const visibilityMenuRef = useRef<View>(null);
  const visibilityTrigger = useRef<View>(null);
  const [body, setBody] = useState('');
  const [editorFocused, setEditorFocused] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(PostVisibility.UNLISTED);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<PostComposerMediaValue>(emptyPostComposerMediaValue);
  const [mediaGeneration, setMediaGeneration] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [commit] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const replyMode = Boolean(replyParentId);
  const contextKey = createPostComposerContextKey(profile.id, replyParentId);
  const contextKeyRef = useRef(contextKey);
  const contextGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    contextGenerationRef.current += 1;
  }
  const availableVisibilityOptions = visibilityOptions.filter((option) =>
    isPostComposerVisibilityAllowed(option.value, replyParentId),
  );
  const bodyText = normalizePostContentPlainText(body);
  const remaining = postBodyMaxLength - bodyText.length;
  const dirty =
    body !== '' ||
    visibility !== PostVisibility.UNLISTED ||
    (!replyMode && (media.items.length > 0 || media.hasPendingMedia || media.sensitiveMedia));
  const disabled =
    submitting ||
    (bodyText.length === 0 && (replyMode || media.items.length === 0)) ||
    (!replyMode && media.hasPendingMedia) ||
    remaining < 0;
  const selectedVisibility =
    availableVisibilityOptions.find((option) => option.value === visibility) ??
    visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;

  const submit = () => {
    if (disabled) {
      return;
    }
    setError(null);
    setVisibilityOpen(false);
    setSubmitting(true);
    const submissionGeneration = contextGenerationRef.current;
    const submittedCallback = onPostCreated;
    const submissionReplyMode = replyMode;
    commit({
      variables: {
        input: {
          ...createPostComposerMutationInput(bodyText, visibility, replyParentId),
          ...(!replyMode ? { media: media.items, sensitiveMedia: media.sensitiveMedia } : {}),
        },
      },
      onCompleted: (response, errors) => {
        if (!mountedRef.current || contextGenerationRef.current !== submissionGeneration) {
          return;
        }
        setSubmitting(false);
        if (errors?.length) {
          setError('게시글을 작성하지 못했습니다.');
          return;
        }

        const createdPost = response.createPost.post;
        if (!createdPost) {
          setError(
            submissionReplyMode ? '답글을 작성하지 못했습니다.' : '게시글을 작성하지 못했습니다.',
          );
          return;
        }

        trackAnalytics('post_created', {
          selected_profile_id: profile.id,
          visibility,
        });
        setBody('');
        setMedia(emptyPostComposerMediaValue);
        setMediaGeneration((generation) => generation + 1);
        setVisibility(PostVisibility.UNLISTED);
        editor.current?.focus();
        submittedCallback?.(createdPost);
      },
      onError: (cause) => {
        if (!mountedRef.current || contextGenerationRef.current !== submissionGeneration) {
          return;
        }
        setSubmitting(false);
        setError(
          cause.message ||
            (submissionReplyMode ? '답글을 작성하지 못했습니다.' : '게시글을 작성하지 못했습니다.'),
        );
      },
    });
  };

  useEffect(() => {
    setBody('');
    setEditorFocused(false);
    setError(null);
    setMedia(emptyPostComposerMediaValue);
    setMediaGeneration((generation) => generation + 1);
    setSubmitting(false);
    setVisibility(PostVisibility.UNLISTED);
    setVisibilityOpen(false);
  }, [contextKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      contextGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    onStateChange?.({ dirty, submitting });
  }, [dirty, onStateChange, submitting]);

  useEffect(() => {
    if (!focusOnMount) {
      return;
    }
    const frame = requestAnimationFrame(() => editor.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [contextKey, focusOnMount]);

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
      accessibilityLabel={replyMode ? '답글 공개 설정' : '게시글 공개 설정'}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'radiogroup'}
      role={Platform.OS === 'web' ? 'menu' : undefined}
      style={[styles.visibilityMenu, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      {availableVisibilityOptions.map((option) => {
        const selected = option.value === visibility;
        const VisibilityIcon = option.icon;
        return (
          <Pressable
            aria-checked={selected}
            accessibilityRole={Platform.OS === 'web' ? undefined : 'radio'}
            accessibilityState={Platform.OS === 'web' ? undefined : { checked: selected }}
            disabled={submitting}
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

  const visibilitySelector = (
    <View
      ref={visibilityControl}
      style={[styles.visibilityControl, { zIndex: visibilityOpen ? 50 : 0 }]}
    >
      <Pressable
        ref={visibilityTrigger}
        aria-expanded={visibilityOpen}
        aria-haspopup="menu"
        accessibilityRole="button"
        accessibilityState={{ disabled: submitting }}
        disabled={submitting}
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
  );

  const submitActions = (
    <View style={styles.submit}>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.remaining, { color: remaining < 0 ? theme.danger : theme.textSecondary }]}
      >
        {remaining.toLocaleString('ko-KR')}
      </Text>
      <Button
        disabled={disabled}
        loading={submitting}
        loadingText={replyMode ? '게시 중' : undefined}
        onPress={submit}
      >
        {submitting && replyMode ? '게시 중' : replyMode ? '답글 게시' : '게시'}
      </Button>
    </View>
  );

  const editorContent = (
    <>
      {beforeEditor}
      <View style={styles.author}>
        <Avatar label={profile.displayName} size={40} />
        <ProfileNameBlock profile={profile} />
      </View>
      <View
        style={[
          styles.editorSurface,
          {
            backgroundColor: theme.background,
            borderColor: error ? theme.danger : editorFocused ? theme.primary : theme.border,
          },
        ]}
      >
        {replyMode ? null : visibilitySelector}
        <TextArea
          ref={editor}
          aria-invalid={Boolean(error)}
          accessibilityLabel={replyMode ? '답글 본문' : '게시글 본문'}
          editable={!submitting}
          onBlur={() => setEditorFocused(false)}
          onChangeText={setBody}
          onFocus={() => setEditorFocused(true)}
          placeholder={replyMode ? '답글을 입력하세요…' : '무슨 일이 일어나고 있나요?'}
          style={styles.editor}
          value={body}
        />
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
        {replyMode ? null : (
          <PostComposerMediaControls
            actions={submitActions}
            disabled={submitting}
            key={mediaGeneration}
            onValueChange={setMedia}
          />
        )}
      </View>
    </>
  );

  return (
    <View
      accessibilityLabel={replyMode ? '답글 작성' : '새 게시글 작성'}
      style={[
        surface ? styles.surfaceRoot : styles.root,
        !surface && replyMode ? styles.replyRoot : null,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      {scrollable ? (
        <ScrollView
          contentContainerStyle={styles.surfaceEditor}
          keyboardShouldPersistTaps="handled"
          style={styles.editorScroll}
          testID="reply-composer-scroll"
        >
          {editorContent}
        </ScrollView>
      ) : (
        editorContent
      )}
      {replyMode ? (
        <View
          style={[
            styles.footer,
            surface ? styles.surfaceFooter : null,
            surface ? { borderColor: theme.border } : null,
          ]}
        >
          {visibilitySelector}
          {submitActions}
        </View>
      ) : null}
      {Platform.OS !== 'web' ? (
        <Modal
          accessibilityLabel={replyMode ? '답글 공개 범위' : '공개 범위'}
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

const styles = StyleSheet.create({
  root: { gap: spacing.lg, padding: spacing.lg },
  replyRoot: { borderRadius: radii.md, borderWidth: 1 },
  surfaceRoot: { flex: 1, minHeight: 0 },
  editorScroll: { flex: 1, minHeight: 0 },
  surfaceEditor: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  author: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  editorSurface: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  editor: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 128,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  surfaceFooter: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  webVisibilityMenu: { marginTop: spacing.xs, width: 256, zIndex: 50 },
  submit: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  remaining: { fontFamily: 'SUIT', ...typography.xsm },
  error: { fontFamily: 'SUIT', ...typography.sm },
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
