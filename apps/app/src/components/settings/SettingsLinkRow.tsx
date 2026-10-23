import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths } from '@/theme/tokens';
import { SettingsItem } from './SettingsItem';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export type SettingsLinkRowProps = {
  accessibilityLabel: string;
  currentPage?: boolean;
  description?: string;
  external?: boolean;
  href: Href;
  label: string;
  onNavigate?: () => void;
  primary?: boolean;
  selected?: boolean;
  testID?: string;
};

type SettingsLinkFeedbackProps = {
  children: ReactNode;
  hovered: boolean;
  pressed: boolean;
  selected: boolean;
};

function SettingsLinkFeedback({ children, hovered, pressed, selected }: SettingsLinkFeedbackProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = pressed || hovered;
  const backgroundColor = pressed
    ? theme.statePressed
    : hovered
      ? theme.stateHover
      : selected
        ? theme.stateSelectedSurface
        : 'transparent';
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    instantKey: theme,
    reducedMotion,
    role: interaction ? 'interaction' : 'selection',
  });
  const animatedBorder = useAnimatedColorTransition({
    color: selected ? theme.stateSelectedBorder : 'transparent',
    instantKey: theme,
    reducedMotion,
    role: 'selection',
  });

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.feedback,
          { backgroundColor: animatedBackground, borderColor: animatedBorder } as ViewStyle,
        ]}
      />
      {children}
    </>
  );
}

export function SettingsLinkRow({
  accessibilityLabel,
  currentPage = false,
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
  const web = Platform.OS === 'web';

  const row = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      accessibilityState={{ selected }}
      aria-current={currentPage ? 'page' : undefined}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (!web) {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={external ? onNavigate : undefined}
      onPointerDown={() => setFocusVisible(false)}
      style={() => {
        return [
          styles.entry,
          {
            borderColor: 'transparent',
            borderWidth: borderWidths[1],
            outlineColor: focusVisible ? theme.stateFocusRing : undefined,
            outlineOffset: 2,
            outlineStyle: focusVisible ? 'solid' : 'none',
            outlineWidth: focusVisible ? 2 : 0,
          } as unknown as ViewStyle,
        ];
      }}
      testID={testID}
    >
      {(state) => {
        const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
        const pressed = Boolean(state.pressed);
        return (
          <SettingsLinkFeedback hovered={hovered} pressed={pressed} selected={selected}>
            <SettingsItem
              description={description}
              label={label}
              trailing={
                <View accessibilityElementsHidden pointerEvents="none">
                  <ChevronRightIcon color={theme.foregroundSecondary} size={20} strokeWidth={2} />
                </View>
              }
            />
          </SettingsLinkFeedback>
        );
      }}
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
    <NavigationLink href={href} onNavigate={onNavigate} primary={primary} push>
      {row}
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  feedback: { borderWidth: borderWidths[1], width: '100%' },
  entry: {
    minHeight: 64,
    width: '100%',
  },
});
