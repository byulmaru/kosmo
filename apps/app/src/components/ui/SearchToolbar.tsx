import { ArrowLeft, Menu, Search, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontSizes, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import type { ReactElement, RefObject } from 'react';
import type { TextInput as NativeTextInput, View as NativeView, ViewStyle } from 'react-native';

export type SearchToolbarLeadingAction = 'back' | 'menu' | 'none';

export type SearchToolbarRenderLeadingControlProps = Readonly<{
  action: 'back';
  children: ReactElement;
  disabled: boolean;
}>;

export type SearchToolbarProps = {
  disabled?: boolean;
  focused: boolean;
  leadingAction?: SearchToolbarLeadingAction;
  leadingControlAriaControls?: string;
  leadingControlExpanded?: boolean;
  leadingControlRef?: RefObject<NativeView | null>;
  onBackPress?: () => void;
  onBlur: () => void;
  onClear: () => void;
  onFocus: () => void;
  onMenuPress?: () => void;
  onSubmit: (text: string) => void;
  renderLeadingControl?: (props: SearchToolbarRenderLeadingControlProps) => ReactElement;
  inputRef?: RefObject<NativeTextInput | null>;
  placeholder?: string;
  query: string;
};

export function SearchToolbar({
  disabled = false,
  focused,
  leadingAction = 'menu',
  leadingControlAriaControls,
  leadingControlExpanded = false,
  leadingControlRef,
  onBackPress,
  onBlur,
  onClear,
  onFocus,
  onMenuPress,
  onSubmit,
  renderLeadingControl,
  inputRef,
  placeholder = '검색어를 입력하세요',
  query,
}: SearchToolbarProps) {
  const theme = useTheme();
  const internalInputRef = useRef<NativeTextInput>(null);
  const resolvedInputRef = inputRef ?? internalInputRef;
  // Keep the draft beside TextInput; Stack options otherwise replay the route's previous value.
  const [draft, setDraft] = useState({ focused, query, text: query });
  const [inputFocused, setInputFocused] = useState(false);
  const [focusVisibleControl, setFocusVisibleControl] = useState<'leading' | 'clear' | null>(null);

  if (draft.query !== query || draft.focused !== focused) {
    setDraft({ focused, query, text: focused ? draft.text : query });
  }

  const showMenu = leadingAction === 'menu';
  const showBack = leadingAction === 'back';
  const hasLeading = showMenu || showBack;
  const leadingDisabled =
    disabled || (showMenu && onMenuPress === undefined) || (showBack && onBackPress === undefined);
  const iconColor = disabled ? theme.stateDisabledForeground : theme.foregroundSecondary;
  const leadingIconColor = leadingDisabled ? theme.stateDisabledForeground : iconColor;
  const controlStyle = [
    styles.control,
    {
      height: 44,
      width: 44,
    },
    Platform.OS === 'web'
      ? ({
          outlineColor: focusVisibleControl === 'leading' ? theme.stateFocusRing : undefined,
          outlineOffset: -2,
          outlineStyle: focusVisibleControl === 'leading' ? 'solid' : 'none',
          outlineWidth: focusVisibleControl === 'leading' ? borderWidths[2] : borderWidths[0],
        } as ViewStyle)
      : undefined,
  ];
  const backControl = showBack ? (
    <IconButton
      accessibilityLabel="뒤로"
      disabled={leadingDisabled}
      onBlur={() => setFocusVisibleControl((current) => (current === 'leading' ? null : current))}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisibleControl(
          Platform.OS === 'web' && target.matches?.(':focus-visible') === true ? 'leading' : null,
        );
      }}
      onPress={() => {
        setDraft((current) => ({ ...current, text: '' }));
        onBackPress?.();
      }}
      onPressIn={onFocus}
      style={controlStyle}
      targetSize={44}
      visualSize={44}
      visualStyle={styles.controlVisual}
    >
      <ArrowLeft color={leadingIconColor} size={iconSizes[20]} strokeWidth={2} />
    </IconButton>
  ) : null;
  const rootStyle =
    Platform.OS === 'web'
      ? [
          styles.root,
          styles.webRoot,
          {
            backgroundColor: theme.backgroundCanvas,
            borderColor: theme.borderSubtle,
            paddingLeft: hasLeading ? space[8] : space[16],
          },
        ]
      : [styles.root, styles.nativeRoot, { backgroundColor: theme.backgroundCanvas }];

  return (
    <View accessibilityLabel="검색" onBlur={onBlur} onFocus={onFocus} style={rootStyle}>
      {showMenu ? (
        <IconButton
          aria-controls={leadingControlAriaControls}
          accessibilityLabel="메뉴 열기"
          accessibilityState={{ expanded: leadingControlExpanded }}
          controlRef={leadingControlRef}
          disabled={leadingDisabled}
          onBlur={() =>
            setFocusVisibleControl((current) => (current === 'leading' ? null : current))
          }
          onFocus={(event) => {
            event.stopPropagation();
            const target = event.currentTarget as unknown as {
              matches?: (selector: string) => boolean;
            };
            setFocusVisibleControl(
              Platform.OS === 'web' && target.matches?.(':focus-visible') === true
                ? 'leading'
                : null,
            );
          }}
          onPress={onMenuPress}
          style={controlStyle}
          targetSize={44}
          visualSize={44}
          visualStyle={styles.controlVisual}
        >
          <Menu color={leadingIconColor} size={iconSizes[24]} strokeWidth={2} />
        </IconButton>
      ) : null}
      {backControl
        ? (renderLeadingControl?.({
            action: 'back',
            children: backControl,
            disabled: leadingDisabled,
          }) ?? backControl)
        : null}

      <View
        testID="search-input-shell"
        style={[
          styles.inputShell,
          {
            backgroundColor: disabled ? theme.stateDisabledSurface : theme.backgroundSurface,
            borderColor: inputFocused ? theme.stateFocusRing : theme.borderSubtle,
            borderWidth: inputFocused ? borderWidths[2] : borderWidths[1],
            paddingRight: draft.text.length > 0 ? space[0] : space[16],
          },
        ]}
      >
        <Search color={iconColor} size={iconSizes[20]} strokeWidth={2} />
        <TextInput
          aria-disabled={disabled}
          accessibilityLabel="검색어"
          accessibilityState={{ disabled }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!disabled}
          ref={resolvedInputRef}
          onBlur={() => setInputFocused(false)}
          onChangeText={(text) => {
            if (!disabled) {
              setDraft((current) => ({ ...current, text }));
            }
          }}
          onFocus={() => setInputFocused(true)}
          onSubmitEditing={(event) => {
            if (!disabled) {
              onSubmit(event.nativeEvent.text);
            }
          }}
          placeholder={placeholder}
          placeholderTextColor={iconColor}
          returnKeyType="search"
          style={[
            styles.input,
            { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
          ]}
          value={draft.text}
        />
        {draft.text.length > 0 ? (
          <IconButton
            accessibilityLabel="검색 지우기"
            disabled={disabled}
            onBlur={() =>
              setFocusVisibleControl((current) => (current === 'clear' ? null : current))
            }
            onFocus={(event) => {
              const target = event.currentTarget as unknown as {
                matches?: (selector: string) => boolean;
              };
              setFocusVisibleControl(
                Platform.OS === 'web' && target.matches?.(':focus-visible') === true
                  ? 'clear'
                  : null,
              );
            }}
            onPress={() => {
              setDraft((current) => ({ ...current, text: '' }));
              onClear();
              resolvedInputRef.current?.focus();
            }}
            onPressIn={onFocus}
            style={[
              styles.control,
              Platform.OS === 'web'
                ? ({
                    outlineColor:
                      focusVisibleControl === 'clear' ? theme.stateFocusRing : undefined,
                    outlineOffset: -2,
                    outlineStyle: focusVisibleControl === 'clear' ? 'solid' : 'none',
                    outlineWidth:
                      focusVisibleControl === 'clear' ? borderWidths[2] : borderWidths[0],
                  } as ViewStyle)
                : undefined,
            ]}
            targetSize={44}
            visualSize={44}
            visualStyle={styles.controlVisual}
          >
            <X color={iconColor} size={iconSizes[18]} strokeWidth={2} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[8],
  },
  webRoot: {
    borderBottomWidth: borderWidths[1],
    height: 64,
    paddingRight: space[16],
  },
  nativeRoot: { flex: 1 },
  inputShell: {
    alignItems: 'center',
    borderRadius: radius.full,
    flex: 1,
    flexDirection: 'row',
    height: 48,
    paddingLeft: space[16],
  },
  input: {
    ...textStyles.uiCopyM,
    // iOS Web 입력 포커스 시 자동 확대를 막는 기존 16px 계약을 유지한다.
    fontSize: fontSizes[16],
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space[8],
    paddingVertical: space[0],
  },
  control: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
  },
  controlVisual: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
  },
});
