import { useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { ViewStyle } from 'react-native';

export type PostLinkPreviewData = Readonly<{
  description: string | null | undefined;
  imageHeight?: number | null;
  imageUrl: string | null | undefined;
  imageWidth?: number | null;
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
  const imageWidth = preview.imageWidth;
  const imageHeight = preview.imageHeight;
  const largeImage = Boolean(
    preview.imageUrl &&
    typeof imageWidth === 'number' &&
    Number.isInteger(imageWidth) &&
    imageWidth >= 600 &&
    typeof imageHeight === 'number' &&
    Number.isInteger(imageHeight) &&
    imageHeight > 0 &&
    imageWidth / imageHeight >= 1.5,
  );
  const copy = (
    <View style={[styles.copy, largeImage ? styles.largeCopy : undefined]}>
      <Text numberOfLines={1} style={[textStyles.uiCopyS, { color: theme.foregroundSecondary }]}>
        {hostname}
      </Text>
      <Text numberOfLines={2} style={[textStyles.uiLabelM, { color: theme.foregroundPrimary }]}>
        {preview.title}
      </Text>
      {preview.description ? (
        <Text numberOfLines={2} style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          {preview.description}
        </Text>
      ) : null}
    </View>
  );
  const image = preview.imageUrl ? (
    <Image
      resizeMode="cover"
      source={{ uri: preview.imageUrl }}
      style={[
        largeImage ? styles.largeImage : styles.image,
        { backgroundColor: theme.backgroundElevated },
      ]}
    />
  ) : null;
  const content = largeImage ? (
    <>
      {image}
      {copy}
    </>
  ) : (
    <>
      {copy}
      {image}
    </>
  );
  const style = [
    styles.card,
    largeImage ? styles.largeCard : undefined,
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
  largeCard: { alignItems: 'stretch', flexDirection: 'column' },
  largeCopy: { flex: 0 },
  largeImage: { aspectRatio: 16 / 9, borderRadius: radius[8], width: '100%' },
});
