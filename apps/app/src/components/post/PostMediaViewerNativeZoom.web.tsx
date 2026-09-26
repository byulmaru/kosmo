import { Image, StyleSheet, View } from 'react-native';
import type { NativeZoomImageProps } from './PostMediaViewerNativeZoomModel';

export function NativeZoomImage({
  accessibilityLabel,
  onStatus,
  status,
  testID = 'post-media-viewer-image',
  url,
  viewportSize,
}: NativeZoomImageProps) {
  return (
    <View style={[styles.root, viewportSize]} testID="post-media-viewer-native-zoom-web-fallback">
      <Image
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="image"
        accessibilityState={{ busy: status === 'loading' }}
        onError={() => onStatus('error')}
        onLoad={() => onStatus('ready')}
        onLoadStart={() => onStatus('loading')}
        resizeMode="contain"
        source={status === 'error' ? undefined : { uri: url }}
        style={styles.image}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  image: { height: '100%', width: '100%' },
});
