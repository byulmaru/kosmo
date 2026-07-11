import { PostVisibility } from '@kosmo/core/enums';
import { postBodyMaxLength } from '@kosmo/core/validation';
import { AtSignIcon, GlobeIcon, LockIcon, MoonIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextField';
import { createTipTapDocumentFromPlainText } from '@/lib/tiptap';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { TextInput } from 'react-native';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';

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
  const [commit, submitting] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const bodyText = body.trim();
  const remaining = postBodyMaxLength - bodyText.length;
  const disabled = submitting || bodyText.length === 0 || remaining < 0;
  const selectedVisibility =
    visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[1];
  const SelectedVisibilityIcon = selectedVisibility.icon;

  const submit = () => {
    if (disabled) {
      return;
    }
    setError(null);
    commit({
      variables: { input: { content: createTipTapDocumentFromPlainText(body), visibility } },
      onCompleted: () => {
        setBody('');
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
        maxLength={postBodyMaxLength + 1}
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
