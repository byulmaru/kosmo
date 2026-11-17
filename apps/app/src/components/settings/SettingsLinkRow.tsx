import { Link } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, fontFamilies, layoutRecipes, space, typography } from '@/theme/tokens';
import { SettingsItemContent } from './SettingsItem';
import type { Href, WebAnchorProps } from 'expo-router';
import type { ViewStyle } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const web = Platform.OS === 'web';
  const externalRel = target === '_blank' ? 'noopener noreferrer' : undefined;
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
  const animatedBottomBorder = useAnimatedColorTransition({
    color: selected ? theme.stateSelectedBorder : theme.borderSubtle,
    instantKey: theme,
    reducedMotion,
    role: 'selection',
  });

  const row = (
    <AnimatedPressable
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
      onHoverIn={() => setHovered(web)}
      onHoverOut={() => setHovered(false)}
      onPress={external ? onNavigate : undefined}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPointerDown={() => setFocusVisible(false)}
      style={[
        styles.entry,
        density === 'compact' ? styles.entryCompact : undefined,
        {
          backgroundColor: animatedBackground,
          borderColor: animatedBorder,
          borderBottomColor: animatedBottomBorder,
          outlineColor: focusVisible ? theme.stateFocusRing : undefined,
          outlineOffset: 2,
          outlineStyle: focusVisible ? 'solid' : 'none',
          outlineWidth: focusVisible ? 2 : 0,
        } as unknown as ViewStyle,
      ]}
      testID={testID}
    >
      <SettingsItemContent
        description={density === 'compact' ? undefined : description}
        label={label}
        trailing={
          <View style={density === 'compact' && description ? styles.inlineTrailing : undefined}>
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
    </AnimatedPressable>
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
  entry: {
    ...layoutRecipes.listRow,
    borderWidth: borderWidths[1],
    minWidth: 0,
    paddingHorizontal: space[16] - borderWidths[1],
    paddingTop: space[12] - borderWidths[1],
    paddingBottom: space[12],
    width: '100%',
  },
  entryCompact: {
    minHeight: 40,
    paddingTop: space[4] - borderWidths[1],
    paddingBottom: space[4],
  },
  inlineTrailing: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  inlineDescription: { flexShrink: 1, fontFamily: fontFamilies.ui, ...typography.sm },
});
