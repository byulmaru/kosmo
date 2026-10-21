import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import type { Href } from 'expo-router';
import type { ReactElement } from 'react';
import type { ViewStyle } from 'react-native';

export function NotificationKindRail({
  accessibilityLabel,
  children,
  disabled = false,
  href,
  iconTestID,
  onActivate,
  pending = false,
  testID,
}: {
  accessibilityLabel: string;
  children: ReactElement;
  disabled?: boolean;
  href: Href;
  iconTestID?: string;
  onActivate?: () => void;
  pending?: boolean;
  testID?: string;
}) {
  return (
    <NotificationLinkTarget
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      href={href}
      onActivate={onActivate}
      pending={pending}
      style={styles.rail}
      testID={testID}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.icon}
        testID={iconTestID}
      >
        {children}
      </View>
    </NotificationLinkTarget>
  );
}

export function NotificationLinkTarget({
  accessibilityLabel,
  children,
  disabled = false,
  href,
  onActivate,
  pending = false,
  style,
  testID,
}: {
  accessibilityLabel: string;
  children: ReactElement;
  disabled?: boolean;
  href: Href;
  onActivate?: () => void;
  pending?: boolean;
  style: ViewStyle;
  testID?: string;
}) {
  const theme = useTheme();
  const web = Platform.OS === 'web';
  const [focusVisible, setFocusVisible] = useState(false);
  const blocked = disabled || pending;
  const target = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      accessibilityState={{ busy: pending, disabled: blocked }}
      aria-busy={pending}
      aria-disabled={blocked}
      disabled={blocked}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const control = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(!web || Boolean(control.matches?.(':focus-visible')));
      }}
      onPointerDown={() => setFocusVisible(false)}
      onPress={blocked ? undefined : onActivate}
      style={StyleSheet.flatten([
        style,
        {
          outlineColor: theme.stateFocusRing,
          outlineOffset: -2,
          outlineStyle: focusVisible ? 'solid' : 'none',
          outlineWidth: focusVisible ? 2 : 0,
          opacity: blocked ? 0.5 : 1,
        } as ViewStyle,
      ])}
      testID={testID}
    >
      {children}
    </Pressable>
  );

  return blocked ? (
    target
  ) : (
    <NavigationLink href={href} push={Platform.OS !== 'web'}>
      {target}
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  rail: { alignSelf: 'stretch', flexShrink: 0, width: 48 },
  icon: { alignItems: 'center', flexShrink: 0, height: 48, justifyContent: 'center', width: 48 },
});
