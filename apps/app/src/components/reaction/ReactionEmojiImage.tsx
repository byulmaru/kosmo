import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getPublicWebOrigin } from '@/config/origin';
import { getReactionEmojiAsset, reactionEmojiCatalog } from './reactionEmojiCatalog';

export type ReactionEmojiImageProps = Readonly<{
  size: number;
  testID?: string;
  type: string;
}>;

export function getReactionEmojiLabel(type: string): string {
  return reactionEmojiCatalog.find((option) => option.id === type)?.label ?? type;
}

export function ReactionEmojiImage({ size, testID, type }: ReactionEmojiImageProps) {
  const asset = getReactionEmojiAsset(type);
  const uri = asset ? `${getPublicWebOrigin()}${asset.path}` : null;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const fallback = getReactionEmojiLabel(type);

  useEffect(() => {
    setFailedUri(null);
  }, [uri]);

  if (asset === null || uri === null || failedUri === uri) {
    return (
      <View style={[styles.fallback, { height: size, width: size }]} testID={testID}>
        <Text accessibilityLabel={fallback} style={[styles.fallbackText, { fontSize: size }]}>
          ?
        </Text>
      </View>
    );
  }

  const imageStyle = { height: size, width: size };
  return (
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
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { textAlign: 'center' },
});
