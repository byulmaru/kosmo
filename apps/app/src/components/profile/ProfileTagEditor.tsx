import { GripVertical } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import {
  moveProfileTag,
  moveProfileTagToIndex,
  validateProfileTagDraftInput,
} from './profileEditState';
import type { ReactNode } from 'react';

export type ProfileTagEditorProps = {
  disabled?: boolean;
  onChange: (next: ReadonlyArray<string>) => void;
  tags: ReadonlyArray<string>;
};

const MAX_PROFILE_TAGS = 5;
const REORDER_ROW_HEIGHT = 40;

export function ProfileTagEditor({ disabled = false, onChange, tags }: ProfileTagEditorProps) {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string>();
  const [reordering, setReordering] = useState(false);
  const maximumReached = tags.length >= MAX_PROFILE_TAGS;
  const inputDisabled = disabled || maximumReached;

  const addTag = () => {
    const result = validateProfileTagDraftInput(input, tags);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onChange([...tags, result.value]);
    setInput('');
    setError(undefined);
  };

  if (reordering) {
    return (
      <View style={styles.root}>
        <View style={styles.headingRow}>
          <Text style={[styles.label, { color: theme.text }]}>프로필 태그 순서</Text>
          <Button
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => setReordering(false)}
            style={styles.modeButton}
            tone="secondary"
          >
            순서 변경 완료
          </Button>
        </View>

        <View accessibilityLabel="현재 태그 순서" style={styles.reorderList}>
          {tags.map((tag, index) => {
            const first = index === 0;
            const last = index === tags.length - 1;

            return (
              <ProfileTagReorderRow
                disabled={disabled}
                index={index}
                key={tag}
                onMove={(fromIndex, toIndex) =>
                  onChange(moveProfileTagToIndex(tags, fromIndex, toIndex))
                }
                tag={tag}
                total={tags.length}
              >
                <View style={styles.reorderActions}>
                  <TagAction
                    accessibilityLabel={`#${tag} 위로 이동`}
                    disabled={disabled || first}
                    onPress={() => onChange(moveProfileTag(tags, index, -1))}
                  >
                    위로
                  </TagAction>
                  <TagAction
                    accessibilityLabel={`#${tag} 아래로 이동`}
                    disabled={disabled || last}
                    onPress={() => onChange(moveProfileTag(tags, index, 1))}
                  >
                    아래로
                  </TagAction>
                </View>
              </ProfileTagReorderRow>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text style={[styles.label, { color: theme.text }]}>프로필 태그</Text>
        <Button
          accessibilityState={{ disabled: disabled || tags.length < 2 }}
          disabled={disabled || tags.length < 2}
          onPress={() => setReordering(true)}
          style={styles.modeButton}
          tone="secondary"
        >
          순서 변경
        </Button>
      </View>

      <View style={styles.chips}>
        {tags.map((tag, index) => (
          <View
            key={tag}
            style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            <Text style={[styles.tagText, { color: theme.text }]} testID="profile-tag-chip">
              #{tag}
            </Text>
            <Pressable
              accessibilityLabel={`#${tag} 제거`}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onChange(tags.filter((_, tagIndex) => tagIndex !== index))}
              style={({ pressed }) => [
                styles.removeButton,
                { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.removeLabel, { color: theme.textSecondary }]}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.inputRow}>
        <View style={styles.input}>
          <TextField
            aria-disabled={inputDisabled}
            accessibilityLabel="프로필 태그"
            accessibilityState={{ disabled: inputDisabled }}
            editable={!inputDisabled}
            error={error}
            onChangeText={(next) => {
              setInput(next);
              setError(undefined);
            }}
            onSubmitEditing={addTag}
            placeholder="태그 입력"
            value={input}
          />
        </View>
        <Button
          accessibilityState={{ disabled: inputDisabled }}
          disabled={inputDisabled}
          onPress={addTag}
          style={styles.addButton}
          tone="secondary"
        >
          태그 추가
        </Button>
      </View>

      {maximumReached ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.helper, { color: theme.textSecondary }]}
        >
          최대 5개까지 추가할 수 있어요.
        </Text>
      ) : null}
    </View>
  );
}

function ProfileTagReorderRow({
  children,
  disabled,
  index,
  onMove,
  tag,
  total,
}: {
  children: ReactNode;
  disabled: boolean;
  index: number;
  onMove: (fromIndex: number, toIndex: number) => void;
  tag: string;
  total: number;
}) {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => !disabled && Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_event, gesture) => translateY.setValue(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          translateY.setValue(0);
          const offset = Math.round(gesture.dy / REORDER_ROW_HEIGHT);
          const toIndex = Math.max(0, Math.min(total - 1, index + offset));

          if (toIndex !== index) {
            onMove(index, toIndex);
          }
        },
        onPanResponderTerminate: () => translateY.setValue(0),
        onStartShouldSetPanResponder: () => !disabled,
      }),
    [disabled, index, onMove, total, translateY],
  );

  return (
    <Animated.View
      style={[styles.reorderRow, { borderColor: theme.border, transform: [{ translateY }] }]}
    >
      <View style={styles.reorderIdentity}>
        <View
          {...panResponder.panHandlers}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[styles.dragHandle, { opacity: disabled ? 0.45 : 1 }]}
          testID="profile-tag-drag-handle"
        >
          <GripVertical color={theme.textSecondary} size={18} strokeWidth={2} />
        </View>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[styles.tagText, styles.reorderTagText, { color: theme.text }]}
          testID="profile-tag-order-item"
        >
          #{tag}
        </Text>
      </View>
      {children}
    </Animated.View>
  );
}

function TagAction({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  children: string;
  disabled: boolean;
  onPress: () => void;
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
        styles.reorderButton,
        {
          borderColor: theme.border,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.reorderLabel, { color: theme.text }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.sm,
  },
  modeButton: {
    minHeight: 36,
    minWidth: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    alignItems: 'center',
    borderRadius: radii.full,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 32,
    paddingLeft: spacing.md,
  },
  tagText: {
    fontFamily: 'SUIT',
    ...typography.sm,
  },
  removeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 32,
  },
  removeLabel: {
    fontFamily: 'SUIT',
    ...typography.lg,
  },
  inputRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
  addButton: {
    minHeight: 36,
    minWidth: 88,
  },
  helper: {
    fontFamily: 'SUIT',
    ...typography.xsm,
  },
  reorderList: {
    gap: 0,
  },
  reorderRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: REORDER_ROW_HEIGHT,
    justifyContent: 'space-between',
  },
  reorderIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  reorderTagText: {
    flex: 1,
  },
  dragHandle: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  reorderActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
  },
  reorderButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 48,
    paddingHorizontal: spacing.sm,
  },
  reorderLabel: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    ...typography.xsm,
  },
});
