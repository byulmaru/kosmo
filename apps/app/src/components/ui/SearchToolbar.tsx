import { ArrowLeft, Menu, Search, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, motion, radius, space, textStyles } from '@/theme/tokens';
import { IconButton } from './IconButton';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { NavigationChromePlatform } from './navigationChrome';

export type SearchToolbarLeadingAction = 'back' | 'menu' | 'none';

export type SearchToolbarProps = {
  disabled?: boolean;
  leadingAction?: SearchToolbarLeadingAction;
  onBackPress?: () => void;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onMenuPress?: () => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  platform?: NavigationChromePlatform;
  value: string;
};

export function SearchToolbar({
  disabled = false,
  leadingAction = 'menu',
  onBackPress,
  onChangeText,
  onClear,
  onMenuPress,
  onSubmit,
  placeholder = '검색어를 입력하세요',
  platform = 'web',
  value,
}: SearchToolbarProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<TextInput>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [focusVisibleControl, setFocusVisibleControl] = useState<'clear' | 'leading' | null>(null);
  const targetSize = platform === 'android' ? 48 : 44;
  const showMenu = leadingAction === 'menu' && platform === 'web';
  const showBack = leadingAction === 'back';
  const hasLeading = showMenu || showBack;
  const leadingDisabled =
    disabled || (showMenu && onMenuPress === undefined) || (showBack && onBackPress === undefined);
  const iconColor = disabled ? theme.stateDisabledForeground : theme.foregroundSecondary;
  const leadingIconColor = leadingDisabled ? theme.stateDisabledForeground : iconColor;
  const controlStyle = (control: 'clear' | 'leading') => {
    return [
      styles.control,
      { height: targetSize, width: targetSize },
      platform === 'web'
        ? ({
            outlineColor: focusVisibleControl === control ? theme.stateFocusRing : undefined,
            outlineOffset: -2,
            outlineStyle: focusVisibleControl === control ? 'solid' : 'none',
            outlineWidth: focusVisibleControl === control ? borderWidths[2] : borderWidths[0],
          } as ViewStyle)
        : undefined,
    ];
  };
  const controlVisualStyle = (controlDisabled: boolean, state: PressableStateCallbackType) => {
    const webState = state as PressableStateCallbackType & {
      hovered?: boolean;
    };
    const hovered = platform === 'web' && Boolean(webState.hovered);

    return [
      styles.controlVisual,
      platform === 'web'
        ? ({
            transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
            transitionProperty: 'background-color, transform',
            transitionTimingFunction: motion.easing.standard,
          } as unknown as ViewStyle)
        : undefined,
      {
        backgroundColor: controlDisabled
          ? 'transparent'
          : state.pressed
            ? theme.statePressed
            : hovered
              ? theme.stateHover
              : 'transparent',
        transform: reducedMotion ? undefined : [{ scale: state.pressed ? 0.98 : 1 }],
      },
    ];
  };

  return (
    <View
      accessibilityLabel="검색"
      style={[
        styles.root,
        {
          backgroundColor: theme.backgroundCanvas,
          borderColor: theme.borderSubtle,
          paddingLeft: hasLeading ? space[8] : space[16],
        },
      ]}
    >
      {showMenu ? (
        <IconButton
          accessibilityLabel="메뉴 열기"
          disabled={leadingDisabled}
          onBlur={() => setFocusVisibleControl(null)}
          onFocus={(event) => {
            const target = event.currentTarget as unknown as {
              matches?: (selector: string) => boolean;
            };
            setFocusVisibleControl(
              platform === 'web' && target.matches?.(':focus-visible') ? 'leading' : null,
            );
          }}
          onPress={onMenuPress}
          style={() => controlStyle('leading')}
          targetSize={targetSize}
          visualSize={targetSize}
          visualStyle={(state) => controlVisualStyle(leadingDisabled, state)}
        >
          <Menu color={leadingIconColor} size={iconSizes[24]} strokeWidth={2} />
        </IconButton>
      ) : null}
      {showBack ? (
        <IconButton
          accessibilityLabel="뒤로"
          disabled={leadingDisabled}
          onBlur={() => setFocusVisibleControl(null)}
          onFocus={(event) => {
            const target = event.currentTarget as unknown as {
              matches?: (selector: string) => boolean;
            };
            setFocusVisibleControl(
              platform === 'web' && target.matches?.(':focus-visible') ? 'leading' : null,
            );
          }}
          onPress={onBackPress}
          style={() => controlStyle('leading')}
          targetSize={targetSize}
          visualSize={targetSize}
          visualStyle={(state) => controlVisualStyle(leadingDisabled, state)}
        >
          <ArrowLeft color={leadingIconColor} size={iconSizes[20]} strokeWidth={2} />
        </IconButton>
      ) : null}

      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: disabled ? theme.stateDisabledSurface : theme.backgroundSurface,
            borderColor: inputFocused ? theme.stateFocusRing : theme.borderSubtle,
            borderWidth: inputFocused ? borderWidths[2] : borderWidths[1],
            paddingRight: value.length > 0 ? space[0] : space[16],
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
          ref={inputRef}
          onBlur={() => setInputFocused(false)}
          onChangeText={(nextValue) => {
            if (!disabled) {
              onChangeText(nextValue);
            }
          }}
          onFocus={() => setInputFocused(true)}
          onSubmitEditing={() => {
            if (!disabled) {
              onSubmit(value);
            }
          }}
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
            onBlur={() => setFocusVisibleControl(null)}
            onFocus={(event) => {
              const target = event.currentTarget as unknown as {
                matches?: (selector: string) => boolean;
              };
              setFocusVisibleControl(
                platform === 'web' && target.matches?.(':focus-visible') ? 'clear' : null,
              );
            }}
            onPress={() => {
              onClear();
              inputRef.current?.focus();
            }}
            onPressIn={() => inputRef.current?.focus()}
            style={() => controlStyle('clear')}
            targetSize={targetSize}
            visualSize={targetSize}
            visualStyle={(state) => controlVisualStyle(disabled, state)}
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
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    height: 64,
    paddingRight: space[16],
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
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space[8],
    paddingVertical: space[0],
  },
});
