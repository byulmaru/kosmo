import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontSizes, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import type { RefObject } from 'react';
import type { TextInputProps, ViewStyle } from 'react-native';
import type { NavigationChromePlatform } from './navigationChrome';

export type SearchInputProps = {
  appearance: 'toolbar' | 'header';
  disabled?: boolean;
  inputRef: RefObject<TextInput | null>;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onClearPressIn: () => void;
  onSubmitEditing: TextInputProps['onSubmitEditing'];
  placeholder?: string;
  platform?: NavigationChromePlatform;
  value: string;
};

export function SearchInput({
  appearance,
  disabled = false,
  inputRef,
  onChangeText,
  onClear,
  onClearPressIn,
  onSubmitEditing,
  placeholder = '검색어를 입력하세요',
  platform = 'web',
  value,
}: SearchInputProps) {
  const theme = useTheme();
  const isToolbar = appearance === 'toolbar';
  const [inputFocused, setInputFocused] = useState(false);
  const [clearFocusVisible, setClearFocusVisible] = useState(false);
  const iconColor = disabled ? theme.stateDisabledForeground : theme.foregroundSecondary;
  const controlSize = isToolbar && platform === 'android' ? 48 : 44;

  return (
    <View
      testID="search-input-shell"
      style={[
        styles.inputShell,
        isToolbar ? styles.toolbarInputShell : styles.headerInputShell,
        {
          backgroundColor:
            isToolbar && disabled ? theme.stateDisabledSurface : theme.backgroundSurface,
        },
        isToolbar
          ? {
              borderColor: inputFocused ? theme.stateFocusRing : theme.borderSubtle,
              borderWidth: inputFocused ? borderWidths[2] : borderWidths[1],
              paddingRight: value.length > 0 ? space[0] : space[16],
            }
          : undefined,
      ]}
    >
      <Search color={iconColor} size={iconSizes[20]} strokeWidth={2} />
      <TextInput
        aria-disabled={isToolbar ? disabled : undefined}
        accessibilityLabel="검색어"
        accessibilityState={isToolbar ? { disabled } : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        ref={inputRef}
        onBlur={isToolbar ? () => setInputFocused(false) : undefined}
        onChangeText={(nextValue) => {
          if (!disabled) {
            onChangeText(nextValue);
          }
        }}
        onFocus={isToolbar ? () => setInputFocused(true) : undefined}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={iconColor}
        returnKeyType="search"
        style={[
          styles.input,
          { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
        ]}
        value={value}
      />
      {value.length > 0 ? (
        <IconButton
          accessibilityLabel="검색 지우기"
          disabled={disabled}
          onBlur={() => setClearFocusVisible(false)}
          onFocus={(event) => {
            if (isToolbar) {
              const target = event.currentTarget as unknown as {
                matches?: (selector: string) => boolean;
              };
              setClearFocusVisible(
                platform === 'web' && target.matches?.(':focus-visible') === true,
              );
            }
          }}
          onPress={onClear}
          onPressIn={onClearPressIn}
          style={[
            styles.control,
            isToolbar ? styles.toolbarControl : undefined,
            isToolbar && platform === 'web'
              ? ({
                  outlineColor: clearFocusVisible ? theme.stateFocusRing : undefined,
                  outlineOffset: -2,
                  outlineStyle: clearFocusVisible ? 'solid' : 'none',
                  outlineWidth: clearFocusVisible ? borderWidths[2] : borderWidths[0],
                } as ViewStyle)
              : undefined,
          ]}
          targetSize={controlSize}
          visualSize={controlSize}
          visualStyle={isToolbar ? styles.controlVisual : undefined}
        >
          <X color={iconColor} size={iconSizes[18]} strokeWidth={2} />
        </IconButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputShell: {
    alignItems: 'center',
    borderRadius: radius.full,
    flex: 1,
    flexDirection: 'row',
    paddingLeft: space[16],
  },
  toolbarInputShell: { height: 48 },
  headerInputShell: { height: 44 },
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
    justifyContent: 'center',
  },
  toolbarControl: { borderRadius: radius[8] },
  controlVisual: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
  },
});
