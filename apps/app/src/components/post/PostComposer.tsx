import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextField';
import { createTipTapDocumentFromPlainText } from '@/lib/tiptap';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { PostComposer_profile$key } from './__generated__/PostComposer_profile.graphql';
import type { PostComposerCreatePostMutation } from './__generated__/PostComposerCreatePostMutation.graphql';

const MAX_LENGTH = 500;
const visibilityOptions = [
  { label: '공개', value: 'PUBLIC' },
  { label: '조용한 공개', value: 'UNLISTED' },
  { label: '팔로워만', value: 'FOLLOWERS' },
  { label: '언급한 계정만', value: 'DIRECT' },
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
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('UNLISTED');
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commit, submitting] = useMutation<PostComposerCreatePostMutation>(CreatePostMutation);
  const remaining = MAX_LENGTH - body.length;
  const disabled = submitting || body.trim().length === 0 || remaining < 0;

  const submit = () => {
    if (disabled) {
      return;
    }
    setError(null);
    commit({
      variables: { input: { content: createTipTapDocumentFromPlainText(body), visibility } },
      onCompleted: () => {
        setBody('');
        setVisibility('UNLISTED');
      },
      onError: (cause) => setError(cause.message || '게시글을 작성하지 못했습니다.'),
    });
  };

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
        accessibilityLabel="게시글 본문"
        editable={!submitting}
        maxLength={MAX_LENGTH + 1}
        onChangeText={setBody}
        placeholder="무슨 일이 일어나고 있나요?"
        value={body}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Button onPress={() => setVisibilityOpen(true)} tone="secondary">
          {visibilityOptions.find((option) => option.value === visibility)?.label}
        </Button>
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

      <Modal
        accessibilityLabel="공개 범위"
        animationType="fade"
        onRequestClose={() => setVisibilityOpen(false)}
        role="dialog"
        transparent
        visible={visibilityOpen}
      >
        <Pressable onPress={() => setVisibilityOpen(false)} style={styles.backdrop}>
          <View style={[styles.visibilityModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.heading, { color: theme.text }]}>공개 범위</Text>
            {visibilityOptions.map((option) => (
              <Pressable
                aria-checked={option.value === visibility}
                accessibilityRole="radio"
                accessibilityState={{ checked: option.value === visibility }}
                key={option.value}
                onPress={() => {
                  setVisibility(option.value);
                  setVisibilityOpen(false);
                }}
                style={[
                  styles.visibilityOption,
                  { backgroundColor: option.value === visibility ? theme.surface : 'transparent' },
                ]}
              >
                <Text style={[styles.visibilityLabel, { color: theme.text }]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, borderWidth: 1, gap: spacing.lg, padding: spacing.lg },
  author: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
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
  visibilityModal: {
    borderRadius: radii.lg,
    gap: spacing.xs,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
  },
  heading: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  visibilityOption: { borderRadius: radii.md, padding: spacing.md },
  visibilityLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
});
