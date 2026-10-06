import { useId, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { findPostComposerMentionQuery } from './postComposerState';
import type { ReactNode, RefObject } from 'react';
import type { TextInput, TextInputProps, ViewProps, ViewStyle } from 'react-native';
import type {
  PostComposerMentionCandidate,
  PostComposerMentionCandidateResults,
  PostComposerMentionQuery,
  PostComposerMentionSearchState,
  PostComposerTextSelection,
} from './postComposerState';

type InputWebProps = {
  'aria-activedescendant'?: string;
  'aria-autocomplete': 'list';
  'aria-controls'?: string;
};

type MentionInputRenderProps = Readonly<{
  onChangeText: (value: string) => void;
  onKeyPress: NonNullable<TextInputProps['onKeyPress']>;
  onSelectionChange: NonNullable<TextInputProps['onSelectionChange']>;
  selection: NonNullable<TextInputProps['selection']>;
  webProps: InputWebProps;
}>;

type Props = Readonly<{
  authorProfileId: string;
  body: string;
  disabled?: boolean;
  inputRef: RefObject<TextInput | null>;
  mentionCandidates?: PostComposerMentionCandidateResults;
  mentionSearchState?: PostComposerMentionSearchState;
  onBodyChange: (value: string) => void;
  onRetryMentionSearch?: () => void;
  onSelectionChange: (selection: PostComposerTextSelection) => void;
  selection: PostComposerTextSelection;
  onSelectMention: (
    candidate: PostComposerMentionCandidate,
    query: PostComposerMentionQuery,
  ) => void;
  renderInput: (props: MentionInputRenderProps) => ReactNode;
}>;

export function PostComposerMentionInput({
  authorProfileId,
  body,
  disabled = false,
  inputRef,
  mentionCandidates,
  mentionSearchState,
  onBodyChange,
  onRetryMentionSearch,
  onSelectionChange: updateSelection,
  onSelectMention,
  renderInput,
  selection,
}: Props) {
  const theme = useTheme();
  const rawListboxId = useId();
  const listboxId = `post-composer-mention-list-${rawListboxId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [dismissedQueryKey, setDismissedQueryKey] = useState<string | null>(null);
  const activeQuery = findPostComposerMentionQuery(body, selection.start, selection.end);
  const queryKey = activeQuery
    ? `${body}\u0000${activeQuery.start}\u0000${activeQuery.end}\u0000${activeQuery.query}`
    : null;
  const isCandidateResultCurrent = Boolean(
    activeQuery?.query.trim() &&
    mentionCandidates?.authorProfileId === authorProfileId &&
    mentionCandidates.query === activeQuery.query,
  );
  const candidates = isCandidateResultCurrent ? (mentionCandidates?.profiles ?? []) : [];
  const visible = activeQuery !== null && queryKey !== dismissedQueryKey;
  const selectedCandidateIndex = candidates.findIndex(
    (candidate) => candidate.id === activeCandidateId,
  );
  const activeCandidateIndex =
    candidates.length === 0 ? -1 : selectedCandidateIndex >= 0 ? selectedCandidateIndex : 0;
  const activeCandidate = candidates[activeCandidateIndex];
  const activeDescendant =
    visible && activeCandidate ? `${listboxId}-option-${activeCandidateIndex}` : undefined;

  const selectCandidate = (candidate: PostComposerMentionCandidate) => {
    if (!activeQuery || !isCandidateResultCurrent || disabled) {
      return;
    }
    onSelectMention(candidate, activeQuery);
    setActiveCandidateId(null);
    setDismissedQueryKey(null);
    inputRef.current?.focus();
  };

  const onSelectionChange: MentionInputRenderProps['onSelectionChange'] = (event) => {
    const nextSelection = event.nativeEvent.selection;
    updateSelection({ start: nextSelection.start, end: nextSelection.end });
    setDismissedQueryKey(null);
  };

  const onChangeText = (nextBody: string) => {
    setActiveCandidateId(null);
    setDismissedQueryKey(null);
    onBodyChange(nextBody);
  };

  const onKeyPress: MentionInputRenderProps['onKeyPress'] = (event) => {
    const nativeEvent = event.nativeEvent as unknown as {
      ctrlKey?: boolean;
      isComposing?: boolean;
      key?: string;
      keyCode?: number;
      metaKey?: boolean;
    };
    const key = nativeEvent.key;
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      return;
    }
    if (key === 'Escape' && activeQuery) {
      event.preventDefault();
      setDismissedQueryKey(queryKey);
      return;
    }
    if (!visible || candidates.length === 0 || disabled || !key) {
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      const direction = key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (activeCandidateIndex + direction + candidates.length) % candidates.length;
      setActiveCandidateId(candidates[nextIndex]?.id ?? null);
      return;
    }
    if (key === 'Enter' && !nativeEvent.ctrlKey && !nativeEvent.metaKey) {
      event.preventDefault();
      if (activeCandidate) {
        selectCandidate(activeCandidate);
      }
    }
  };

  const webProps: InputWebProps = {
    'aria-activedescendant': activeDescendant,
    'aria-autocomplete': 'list',
    'aria-controls': visible && candidates.length > 0 ? listboxId : undefined,
  };

  return (
    <View style={styles.root}>
      {renderInput({
        onChangeText,
        onKeyPress,
        onSelectionChange,
        selection,
        webProps,
      })}
      {visible ? (
        <View
          style={[
            styles.suggestions,
            { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
          ]}
        >
          {activeQuery?.query.length === 0 ? (
            <Text style={[styles.message, { color: theme.foregroundSecondary }]}>
              검색어를 입력하세요.
            </Text>
          ) : mentionSearchState === 'loading' ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, { color: theme.foregroundSecondary }]}
            >
              프로필을 검색하고 있어요.
            </Text>
          ) : mentionSearchState === 'error' ? (
            <View>
              <Text
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={[styles.message, { color: theme.foregroundSecondary }]}
              >
                프로필을 검색하지 못했어요.
              </Text>
              {onRetryMentionSearch ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => onRetryMentionSearch()}
                  style={styles.retry}
                >
                  <Text style={[styles.retryLabel, { color: theme.foregroundPrimary }]}>
                    다시 시도
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : candidates.length === 0 ? (
            <Text style={[styles.message, { color: theme.foregroundSecondary }]}>
              검색 결과가 없어요.
            </Text>
          ) : null}
          {candidates.length > 0 ? (
            <ScrollView
              accessibilityLabel="멘션할 프로필 결과"
              keyboardShouldPersistTaps="handled"
              nativeID={listboxId}
              style={styles.candidateList}
              {...(Platform.OS === 'web'
                ? ({ role: 'listbox' } as unknown as Pick<ViewProps, 'role'>)
                : undefined)}
            >
              {candidates.map((candidate, index) => {
                const active = index === activeCandidateIndex;
                const avatarLabel = candidate.displayName || candidate.relativeHandle;
                const domain = candidate.domain?.trim();
                const handleLabel =
                  domain && !candidate.relativeHandle.toLowerCase().includes(domain.toLowerCase())
                    ? `${candidate.relativeHandle} · ${domain}`
                    : candidate.relativeHandle;
                return (
                  <Pressable
                    accessibilityLabel={`${avatarLabel}, ${handleLabel}`}
                    accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                    accessibilityState={{ selected: active }}
                    aria-selected={Platform.OS === 'web' ? active : undefined}
                    disabled={disabled}
                    key={candidate.id}
                    nativeID={`${listboxId}-option-${index}`}
                    onPress={() => selectCandidate(candidate)}
                    role={Platform.OS === 'web' ? ('option' as ViewProps['role']) : undefined}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: pressed || active ? theme.stateHover : 'transparent',
                        opacity: disabled ? 0.5 : 1,
                      },
                    ]}
                    tabIndex={Platform.OS === 'web' ? -1 : undefined}
                  >
                    <Avatar imageUri={candidate.avatar?.url} label={avatarLabel} size={32} />
                    <View style={styles.copy}>
                      <Text
                        numberOfLines={1}
                        style={[styles.name, { color: theme.foregroundPrimary }]}
                      >
                        {avatarLabel}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.handle, { color: theme.foregroundSecondary }]}
                      >
                        {handleLabel}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { flex: 1, gap: space[4], minWidth: 0 },
  candidateList: { maxHeight: 240 },
  handle: textStyles.uiCopyS,
  message: { padding: space[12], ...textStyles.uiCopyM },
  name: textStyles.uiLabelM,
  option: {
    alignItems: 'center',
    borderRadius: radius[12],
    flexDirection: 'row',
    gap: space[12],
    minHeight: 48,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    width: '100%',
  },
  retry: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  retryLabel: textStyles.uiLabelM,
  root: { flex: 1, gap: space[8], position: 'relative', width: '100%' },
  suggestions: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    padding: space[8],
  } as ViewStyle,
});
