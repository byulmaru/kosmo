import { ArrowLeft, Menu, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { RefObject } from 'react';

export function NativeSearchHeader({
  backHref,
  focused,
  inputRef,
  onBackPress,
  onBlur,
  onClear,
  onFocus,
  onSubmit,
  query,
}: {
  backHref: Href;
  focused: boolean;
  inputRef: RefObject<TextInput | null>;
  onBackPress: () => void;
  onBlur: () => void;
  onClear: () => void;
  onFocus: () => void;
  onSubmit: (text: string) => void;
  query: string;
}) {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  // Keep the draft beside TextInput; Stack options otherwise replay the route's previous value.
  const [draft, setDraft] = useState({ focused, query, text: query });
  if (draft.query !== query || draft.focused !== focused) {
    setDraft({ focused, query, text: focused ? draft.text : query });
  }
  const phase = focused ? 'input' : query ? 'results' : 'before';

  return (
    <View accessibilityLabel="검색" onBlur={onBlur} onFocus={onFocus} style={styles.root}>
      {phase === 'before' ? (
        <IconButton
          aria-controls={shellChrome?.navigationDrawerOpen ? 'mobile-sidebar' : undefined}
          accessibilityLabel="메뉴 열기"
          accessibilityState={{ expanded: shellChrome?.navigationDrawerOpen ?? false }}
          controlRef={shellChrome?.navigationDrawerTriggerRef}
          onFocus={(event) => event.stopPropagation()}
          onPress={shellChrome?.openNavigationDrawer}
          style={styles.iconButton}
          targetSize={44}
          visualSize={44}
        >
          <Menu color={theme.text} size={24} strokeWidth={2} />
        </IconButton>
      ) : (
        <NavigationLink href={backHref}>
          <IconButton
            accessibilityLabel="뒤로"
            accessibilityRole="link"
            onPress={() => {
              setDraft((current) => ({ ...current, text: '' }));
              onBackPress();
            }}
            onPressIn={onFocus}
            style={styles.iconButton}
            targetSize={44}
            visualSize={44}
          >
            <ArrowLeft color={theme.textSecondary} size={20} strokeWidth={2} />
          </IconButton>
        </NavigationLink>
      )}
      <View
        style={[styles.inputShell, { backgroundColor: theme.surface }]}
        testID="search-input-shell"
      >
        <Search color={theme.textSecondary} size={20} strokeWidth={2} />
        <TextInput
          ref={inputRef}
          accessibilityLabel="검색어"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
          onSubmitEditing={({ nativeEvent }) => onSubmit(nativeEvent.text)}
          placeholder="검색어를 입력하세요"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
          value={draft.text}
        />
        {draft.text ? (
          <IconButton
            accessibilityLabel="검색 지우기"
            onPress={() => {
              setDraft((current) => ({ ...current, text: '' }));
              onClear();
            }}
            onPressIn={onFocus}
            style={styles.clearButton}
            targetSize={44}
            visualSize={44}
          >
            <X color={theme.textSecondary} size={18} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  inputShell: {
    alignItems: 'center',
    borderRadius: radii.full,
    flex: 1,
    flexDirection: 'row',
    height: 44,
    paddingLeft: spacing.lg,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.ui,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    ...typography.sm,
    fontSize: typography.md.fontSize,
  },
  clearButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
