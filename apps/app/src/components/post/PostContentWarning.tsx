import { EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
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
      style={(state) => [
        styles.root,
        {
          backgroundColor: state.pressed
            ? theme.statePressed
            : (state as { hovered?: boolean }).hovered
              ? theme.stateHover
              : theme.backgroundSurface,
        },
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
    </Pressable>
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
