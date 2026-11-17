import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontFamilies, space, typography } from '@/theme/tokens';
import { SettingsItem } from './SettingsItem';
import type { Href, WebAnchorProps } from 'expo-router';
import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';

export type SettingsLinkRowProps = {
  accessibilityLabel: string;
  currentPage?: boolean;
  density?: 'default' | 'compact';
  description?: string;
  external?: boolean;
  href: Href;
  label: string;
  onNavigate?: () => void;
  primary?: boolean;
  selected?: boolean;
  target?: WebAnchorProps['target'];
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
        style={[styles.feedback, { backgroundColor: animatedBackground } as ViewStyle]}
      />
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.feedback,
          { borderColor: animatedBorder, borderWidth: borderWidths[1] } as ViewStyle,
        ]}
      />
    </>
  );
}

export function SettingsLinkRow({
  accessibilityLabel,
  currentPage = false,
  density = 'default',
  description,
  external = false,
  href,
  label,
  onNavigate,
  primary = false,
  selected = false,
  target,
  testID,
}: SettingsLinkRowProps) {
  const theme = useTheme();
  const [focusVisible, setFocusVisible] = useState(false);
  const web = Platform.OS === 'web';
  const externalRel = target === '_blank' ? 'noopener noreferrer' : undefined;

  const row = (
    <Pressable
      {...(web && external && target ? { hrefAttrs: { rel: externalRel, target } } : {})}
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
          density === 'compact' ? styles.entryCompact : undefined,
          {
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
              density={density}
              description={density === 'compact' ? undefined : description}
              label={label}
              trailing={
                <View
                  style={density === 'compact' && description ? styles.inlineTrailing : undefined}
                >
                  {density === 'compact' && description ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.inlineDescription, { color: theme.foregroundSecondary }]}
                    >
                      {description}
                    </Text>
                  ) : null}
                  <View accessibilityElementsHidden pointerEvents="none">
                    <ChevronRightIcon color={theme.foregroundSecondary} size={20} strokeWidth={2} />
                  </View>
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
      <Link asChild href={href} rel={externalRel} target={target}>
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
  feedback: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  entry: {
    minHeight: 64,
    width: '100%',
  },
  entryCompact: { minHeight: 40 },
  inlineTrailing: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  inlineDescription: { flexShrink: 1, fontFamily: fontFamilies.ui, ...typography.sm },
});
