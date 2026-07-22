import { BookmarkIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { BookmarkAction_post$key } from './__generated__/BookmarkAction_post.graphql';
import type { BookmarkActionCreateBookmarkMutation } from './__generated__/BookmarkActionCreateBookmarkMutation.graphql';
import type { BookmarkActionDeleteBookmarkMutation } from './__generated__/BookmarkActionDeleteBookmarkMutation.graphql';

const BookmarkActionFragment = graphql`
  fragment BookmarkAction_post on Post {
    id
    viewerBookmark {
      id
    }
  }
`;

const CreateBookmarkMutation = graphql`
  mutation BookmarkActionCreateBookmarkMutation($postId: ID!) {
    createBookmark(input: { postId: $postId }) {
      bookmark {
        post {
          id
          viewerBookmark {
            id
          }
        }
      }
    }
  }
`;

const DeleteBookmarkMutation = graphql`
  mutation BookmarkActionDeleteBookmarkMutation($id: ID!) {
    deleteBookmark(input: { id: $id }) {
      bookmarkId @deleteRecord
      post {
        id
        viewerBookmark {
          id
        }
      }
    }
  }
`;

export function BookmarkAction({ post: postKey }: { post: BookmarkAction_post$key }) {
  const theme = useTheme();
  const post = useFragment(BookmarkActionFragment, postKey);
  const [commitCreate, creating] =
    useMutation<BookmarkActionCreateBookmarkMutation>(CreateBookmarkMutation);
  const [commitDelete, deleting] =
    useMutation<BookmarkActionDeleteBookmarkMutation>(DeleteBookmarkMutation);
  const [error, setError] = useState(false);
  const bookmark = post.viewerBookmark;
  const loading = creating || deleting;

  const toggleBookmark = () => {
    if (loading) {
      return;
    }

    setError(false);
    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
        setError(Boolean(errors?.length)),
      onError: () => setError(true),
    };

    if (bookmark) {
      commitDelete({
        ...callbacks,
        variables: { id: bookmark.id },
      });
      return;
    }

    commitCreate({
      ...callbacks,
      variables: { postId: post.id },
    });
  };

  const selected = Boolean(bookmark);
  const label = selected ? '북마크 해제' : '북마크 저장';

  return (
    <View style={styles.root}>
      <Pressable
        aria-busy={loading}
        aria-pressed={selected}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy: loading, disabled: loading, selected }}
        disabled={loading}
        hitSlop={4}
        onPress={toggleBookmark}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? theme.surface : 'transparent',
            opacity: loading ? 0.45 : 1,
          },
        ]}
      >
        <BookmarkIcon
          color={selected ? theme.text : theme.textSecondary}
          fill={selected ? theme.text : 'none'}
          size={20}
          strokeWidth={2}
        />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          북마크 상태를 변경하지 못했습니다. 다시 시도해주세요.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-end' },
  button: {
    alignItems: 'center',
    borderRadius: radii.full,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  error: {
    fontFamily: 'SUIT',
    marginTop: spacing.xs,
    textAlign: 'right',
    ...typography.xsm,
  },
});
