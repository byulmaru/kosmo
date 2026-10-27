import { ArrowLeft, Menu } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { SearchInput } from './SearchInput';
import type { ReactElement, RefObject } from 'react';
import type { TextInput, View as NativeView, ViewStyle } from 'react-native';
import type { NavigationChromePlatform } from './navigationChrome';

export type SearchToolbarLeadingAction = 'back' | 'menu' | 'none';

export type SearchToolbarRenderLeadingControlProps = Readonly<{
  action: 'back';
  children: ReactElement;
  disabled: boolean;
}>;

export type SearchToolbarProps = {
  disabled?: boolean;
  leadingAction?: SearchToolbarLeadingAction;
  leadingControlAriaControls?: string;
  leadingControlExpanded?: boolean;
  leadingControlRef?: RefObject<NativeView | null>;
  onBackPress?: () => void;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onMenuPress?: () => void;
  onSubmit: (value: string) => void;
  renderLeadingControl?: (props: SearchToolbarRenderLeadingControlProps) => ReactElement;
  inputRef?: RefObject<TextInput | null>;
  placeholder?: string;
  platform?: NavigationChromePlatform;
  value: string;
};

export function SearchToolbar({
  disabled = false,
  leadingAction = 'menu',
  leadingControlAriaControls,
  leadingControlExpanded = false,
  leadingControlRef,
  onBackPress,
  onChangeText,
  onClear,
  onMenuPress,
  onSubmit,
  renderLeadingControl,
  inputRef,
  placeholder = '검색어를 입력하세요',
  platform = 'web',
  value,
}: SearchToolbarProps) {
  const theme = useTheme();
  const internalInputRef = useRef<TextInput>(null);
  const resolvedInputRef = inputRef ?? internalInputRef;
  const [leadingFocusVisible, setLeadingFocusVisible] = useState(false);
  const targetSize = platform === 'android' ? 48 : 44;
  const showMenu = leadingAction === 'menu' && platform === 'web';
  const showBack = leadingAction === 'back';
  const hasLeading = showMenu || showBack;
  const leadingDisabled =
    disabled || (showMenu && onMenuPress === undefined) || (showBack && onBackPress === undefined);
  const iconColor = disabled ? theme.stateDisabledForeground : theme.foregroundSecondary;
  const leadingIconColor = leadingDisabled ? theme.stateDisabledForeground : iconColor;
  const controlStyle = StyleSheet.flatten([
    styles.control,
    { height: targetSize, width: targetSize },
    platform === 'web'
      ? ({
          outlineColor: leadingFocusVisible ? theme.stateFocusRing : undefined,
          outlineOffset: -2,
          outlineStyle: leadingFocusVisible ? 'solid' : 'none',
          outlineWidth: leadingFocusVisible ? borderWidths[2] : borderWidths[0],
        } as ViewStyle)
      : undefined,
  ]);
  const backControl = showBack ? (
    <IconButton
      accessibilityLabel="뒤로"
      disabled={leadingDisabled}
      onBlur={() => setLeadingFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setLeadingFocusVisible(platform === 'web' && target.matches?.(':focus-visible') === true);
      }}
      onPress={onBackPress}
      style={controlStyle}
      targetSize={targetSize}
      visualSize={targetSize}
      visualStyle={styles.controlVisual}
    >
      <ArrowLeft color={leadingIconColor} size={iconSizes[20]} strokeWidth={2} />
    </IconButton>
  ) : null;

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
          aria-controls={leadingControlAriaControls}
          accessibilityLabel="메뉴 열기"
          accessibilityState={{ expanded: leadingControlExpanded }}
          controlRef={leadingControlRef}
          disabled={leadingDisabled}
          onBlur={() => setLeadingFocusVisible(false)}
          onFocus={(event) => {
            event.stopPropagation();
            const target = event.currentTarget as unknown as {
              matches?: (selector: string) => boolean;
            };
            setLeadingFocusVisible(
              platform === 'web' && target.matches?.(':focus-visible') === true,
            );
          }}
          onPress={onMenuPress}
          style={controlStyle}
          targetSize={targetSize}
          visualSize={targetSize}
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

      <SearchInput
        appearance="toolbar"
        disabled={disabled}
        inputRef={resolvedInputRef}
        onChangeText={onChangeText}
        onClear={() => {
          onClear();
          resolvedInputRef.current?.focus();
        }}
        onClearPressIn={() => resolvedInputRef.current?.focus()}
        onSubmitEditing={() => {
          if (!disabled) {
            onSubmit(value);
          }
        }}
        placeholder={placeholder}
        platform={platform}
        value={value}
      />
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
});
