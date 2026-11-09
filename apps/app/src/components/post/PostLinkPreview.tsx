import { useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { ViewStyle } from 'react-native';

export type PostLinkPreviewData = Readonly<{
  description: string | null | undefined;
  imageUrl: string | null | undefined;
  title: string;
  url: string;
}>;

export function PostLinkPreviewCard({
  interactive = true,
  preview,
}: {
  interactive?: boolean;
  preview: PostLinkPreviewData;
}) {
  const [focusVisible, setFocusVisible] = useState(false);
  const web = Platform.OS === 'web';
  const theme = useTheme();
  const hostname = new URL(preview.url).hostname;
  const content = (
    <>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[textStyles.uiCopyS, { color: theme.foregroundSecondary }]}>
          {hostname}
        </Text>
        <Text numberOfLines={2} style={[textStyles.uiLabelM, { color: theme.foregroundPrimary }]}>
          {preview.title}
        </Text>
        {preview.description ? (
          <Text
            numberOfLines={2}
            style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}
          >
            {preview.description}
          </Text>
        ) : null}
      </View>
      {preview.imageUrl ? (
        <Image
          resizeMode="cover"
          source={{ uri: preview.imageUrl }}
          style={[styles.image, { backgroundColor: theme.backgroundElevated }]}
        />
      ) : null}
    </>
  );
  const style = [
    styles.card,
    { backgroundColor: theme.backgroundSurface, borderColor: theme.borderDefault },
  ];

  if (!interactive) {
    return (
      <View style={style} testID="post-link-preview-card">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`${preview.title}, ${hostname}`}
      accessibilityRole="link"
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
      onPress={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void Linking.openURL(preview.url);
      }}
      onPointerDown={() => setFocusVisible(false)}
      style={[
        style,
        web
          ? ({
              outlineColor: theme.stateFocusRing,
              outlineOffset: 2,
              outlineStyle: focusVisible ? 'solid' : 'none',
              outlineWidth: focusVisible ? borderWidths[2] : borderWidths[0],
            } as unknown as ViewStyle)
          : undefined,
      ]}
      testID="post-link-preview-card"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    minWidth: 0,
    padding: space[12],
    width: '100%',
  },
  copy: { flex: 1, gap: space[4], minWidth: 0 },
  image: { borderRadius: radius[8], flexShrink: 0, height: 96, width: 96 },
});
