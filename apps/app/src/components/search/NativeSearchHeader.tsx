import { ArrowLeft, Menu } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

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
      <SearchInput
        appearance="header"
        inputRef={inputRef}
        onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
        onClear={() => {
          setDraft((current) => ({ ...current, text: '' }));
          onClear();
        }}
        onClearPressIn={onFocus}
        onSubmitEditing={({ nativeEvent }) => onSubmit(nativeEvent.text)}
        value={draft.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
