import { Image, StyleSheet } from 'react-native';
import fullLogo from '../../assets/brand/brand-logo-full-light.png';
import brandMark from '../../assets/brand/brand-mark-light.png';
import type { ImageSourcePropType, ImageStyle, StyleProp } from 'react-native';

const brandLogoAssets = {
  full: fullLogo,
  mark: brandMark,
} as const;

function resolveBrandLogoSource(source: ImageSourcePropType | string): ImageSourcePropType {
  return typeof source === 'string' ? { uri: source } : source;
}

type BrandLogoProps = {
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
  variant?: keyof typeof brandLogoAssets;
  width: number;
};

export function BrandLogo({
  accessibilityLabel = 'KOSMO 로고',
  style,
  variant = 'mark',
  width,
}: BrandLogoProps) {
  const dimensions =
    variant === 'full' ? { aspectRatio: 1665 / 1050, width } : { height: width, width };

  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      resizeMode="contain"
      source={resolveBrandLogoSource(brandLogoAssets[variant])}
      style={[dimensions, styles.image, style]}
    />
  );
}

const styles = StyleSheet.create({
  image: { flexShrink: 0 },
});
