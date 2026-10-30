import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import type { ImageLoadEvent } from 'react-native';

export type PostContentEmojiProps = Readonly<{
  accessible?: boolean;
  fontSize: number;
  shortcode: string;
  url: string;
}>;

export function PostContentEmoji(props: PostContentEmojiProps) {
  return <PostContentEmojiSource {...props} key={props.url} />;
}

function PostContentEmojiSource({
  accessible = true,
  fontSize,
  shortcode,
  url,
}: PostContentEmojiProps) {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const handleLoad = (event?: ImageLoadEvent) => {
    const source = event?.nativeEvent?.source;
    const target = (
      event?.nativeEvent as ImageLoadEvent['nativeEvent'] & {
        target?: { naturalHeight?: number; naturalWidth?: number };
      }
    )?.target;
    const width = source?.width ?? target?.naturalWidth;
    const height = source?.height ?? target?.naturalHeight;
    if (width && height) {
      setAspectRatio(width / height);
    } else {
      Image.getSize(
        url,
        (loadedWidth, loadedHeight) => {
          if (loadedWidth > 0 && loadedHeight > 0) {
            setAspectRatio(loadedWidth / loadedHeight);
          }
        },
        () => undefined,
      );
    }
    setStatus('loaded');
  };

  if (status === 'error') {
    return <>{shortcode}</>;
  }

  const loaded = status === 'loaded';
  return (
    <>
      <Image
        accessible={loaded && accessible}
        accessibilityLabel={loaded ? shortcode : undefined}
        accessibilityRole={loaded ? 'image' : undefined}
        fadeDuration={0}
        onError={() => setStatus('error')}
        onLoad={handleLoad}
        resizeMode="contain"
        source={{ uri: url }}
        style={
          loaded
            ? { height: fontSize, width: fontSize * aspectRatio }
            : [styles.preload, { height: fontSize, width: fontSize }]
        }
        testID="post-content-emoji-image"
      />
      {loaded ? null : shortcode}
    </>
  );
}

const styles = StyleSheet.create({
  preload: { opacity: 0, position: 'absolute' },
});
