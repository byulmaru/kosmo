import { EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnimatedColorTransition } from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ViewStyle } from 'react-native';

export type PostContentWarningProps = Readonly<{
  imageCount: number | null;
  onPress: () => void;
  revealed: boolean;
  summary: string;
}>;

export function PostContentWarning({
  imageCount,
  onPress,
  revealed,
  summary,
}: PostContentWarningProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const metadata = imageCount ? `본문 · 이미지 ${imageCount}개` : '본문';
  const action = revealed ? '다시 가리기' : '보기';

  return (
    <Pressable
      accessibilityLabel={`${summary}, ${metadata}, ${action}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: revealed }}
      aria-expanded={revealed}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Platform.OS !== 'web' || Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={[
        Platform.OS === 'web'
          ? ({
              outlineColor: theme.stateFocusRing,
              outlineOffset: 2,
              outlineStyle: focusVisible ? 'solid' : 'none',
              outlineWidth: focusVisible ? borderWidths[2] : borderWidths[0],
            } as unknown as ViewStyle)
          : undefined,
      ]}
      testID="post-content-warning"
    >
      {(state) => (
        <PostContentWarningVisual
          action={action}
          hovered={Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered)}
          metadata={metadata}
          reducedMotion={reducedMotion}
          summary={summary}
          theme={theme}
          pressed={state.pressed}
        />
      )}
    </Pressable>
  );
}

function PostContentWarningVisual({
  action,
  hovered,
  metadata,
  pressed,
  reducedMotion,
  summary,
  theme,
}: {
  action: string;
  hovered: boolean;
  metadata: string;
  pressed: boolean;
  reducedMotion: boolean;
  summary: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const backgroundColor = pressed
    ? theme.statePressed
    : hovered
      ? theme.stateHover
      : theme.backgroundSurface;
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    instantKey: theme,
    interactionKey: pressed ? 'pressed' : hovered ? 'hovered' : 'idle',
    reducedMotion,
    role: pressed || hovered ? 'interaction' : 'selection',
  });

  return (
    <Animated.View style={[styles.root, { backgroundColor: animatedBackground } as ViewStyle]}>
      <>
        <EyeOff
          accessible={Platform.OS === 'web' ? undefined : false}
          aria-hidden
          color={theme.foregroundPrimary}
          size={iconSizes[20]}
          strokeWidth={2}
        />
        <View style={styles.copy}>
          <Text style={[styles.summary, { color: theme.foregroundPrimary }]}>{summary}</Text>
          <Text style={[styles.metadata, { color: theme.foregroundSecondary }]}>{metadata}</Text>
        </View>
        <Text numberOfLines={1} style={[styles.action, { color: theme.foregroundPrimary }]}>
          {action}
        </Text>
      </>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius[16],
    flexDirection: 'row',
    gap: space[8],
    minHeight: 56,
    paddingHorizontal: space[24],
    paddingVertical: space[8],
  },
  copy: { flex: 1, gap: space[4], marginLeft: space[8], minWidth: 0 },
  summary: { ...textStyles.uiLabelM, flexShrink: 1 },
  metadata: textStyles.uiCopyS,
  action: { ...textStyles.uiLabelM, flexShrink: 0 },
});
