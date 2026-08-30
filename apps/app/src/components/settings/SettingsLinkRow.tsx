import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { SettingsItem } from './SettingsItem';
import type { Href } from 'expo-router';
import type { ViewStyle } from 'react-native';

export type SettingsLinkRowProps = {
  accessibilityLabel: string;
  description?: string;
  external?: boolean;
  href: Href;
  label: string;
  onNavigate?: () => void;
  primary?: boolean;
  selected?: boolean;
  testID?: string;
};

export function SettingsLinkRow({
  accessibilityLabel,
  description,
  external = false,
  href,
  label,
  onNavigate,
  primary = false,
  selected = false,
  testID,
}: SettingsLinkRowProps) {
  const theme = useTheme();
  const [focusVisible, setFocusVisible] = useState(false);

  const row = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      accessibilityState={{ selected }}
      aria-current={selected ? 'page' : undefined}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (Platform.OS !== 'web') {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={external ? onNavigate : undefined}
      onPointerDown={() => setFocusVisible(false)}
      style={(state) => {
        const webState = state as { hovered?: boolean; pressed?: boolean };
        const hovered = Platform.OS === 'web' && Boolean(webState.hovered);
        const pressed = Boolean(webState.pressed);

        return [
          styles.entry,
          {
            backgroundColor: pressed
              ? theme.statePressed
              : hovered
                ? theme.stateHover
                : selected
                  ? theme.selectedSurface
                  : 'transparent',
            outlineColor: focusVisible ? theme.focus : undefined,
            outlineOffset: 2,
            outlineStyle: focusVisible ? 'solid' : 'none',
            outlineWidth: focusVisible ? 2 : 0,
          } as unknown as ViewStyle,
        ];
      }}
      testID={testID}
    >
      <SettingsItem
        description={description}
        label={label}
        trailing={
          <View accessibilityElementsHidden pointerEvents="none">
            <ChevronRightIcon color={theme.textSecondary} size={20} strokeWidth={2} />
          </View>
        }
      />
    </Pressable>
  );

  if (external) {
    return (
      <Link asChild href={href}>
        {row}
      </Link>
    );
  }

  return (
    <NavigationLink href={href} onNavigate={onNavigate} primary={primary}>
      {row}
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  entry: {
    minHeight: 64,
    width: '100%',
  },
});
