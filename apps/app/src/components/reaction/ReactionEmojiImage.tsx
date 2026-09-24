import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as ReactNativeSvg from 'react-native-svg';
import { getPublicWebOrigin } from '@/config/origin';
import { getReactionEmojiAsset, reactionEmojiCatalog } from './reactionEmojiCatalog';

export type ReactionEmojiImageProps = Readonly<{
  size: number;
  testID?: string;
  type: string;
}>;

export function ReactionEmojiImage({ size, testID, type }: ReactionEmojiImageProps) {
  const asset = getReactionEmojiAsset(type);
  const uri = asset ? `${getPublicWebOrigin()}${asset.path}` : null;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const fallback = reactionEmojiCatalog.find((option) => option.id === type)?.label ?? type;

  useEffect(() => {
    setFailedUri(null);
  }, [uri]);

  if (asset === null || uri === null || failedUri === uri) {
    return (
      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.fallback, { height: size, width: size }]}
        testID={testID}
      >
        <Text numberOfLines={1} style={[styles.fallbackText, { fontSize: Math.min(12, size / 2) }]}>
          {fallback}
        </Text>
      </View>
    );
  }

  const imageStyle = { height: size, width: size };
  const SvgUri = ReactNativeSvg.SvgUri;
  return asset.format === 'svg' && SvgUri ? (
    <SvgUri
      accessibilityElementsHidden
      aria-hidden
      height={size}
      importantForAccessibility="no-hide-descendants"
      onError={() => setFailedUri(uri)}
      testID={testID}
      uri={uri}
      width={size}
    />
  ) : (
    <Image
      accessibilityElementsHidden
      accessibilityRole="image"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      onError={() => setFailedUri(uri)}
      resizeMode="contain"
      source={{ uri }}
      style={imageStyle}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fallbackText: { textAlign: 'center' },
});
