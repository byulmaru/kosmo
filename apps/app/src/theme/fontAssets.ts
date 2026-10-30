import { Platform } from 'react-native';
import { fontFamilies } from './tokens';

// Keep one Metro asset reference per package font; only the platform-specific
// registration key changes below.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const pretendardAsset = require('pretendard/dist/public/variable/PretendardVariable.ttf');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const suitAsset = require('@sun-typeface/suit/fonts/variable/ttf/SUIT-Variable.ttf');

export const fontAssets = Platform.select<Record<string, number>>({
  ios: {
    // Keep aliases distinct from the fonts' internal family names so expo-font's
    // alias swizzle does not shadow UIFont's variable family lookup.
    Pretendard: pretendardAsset,
    SUIT: suitAsset,
  },
  default: {
    // Android config-plugin registrations are detected by expo-font, so this
    // stays a fallback for binaries that predate the native registrations.
    [fontFamilies.content]: pretendardAsset,
    [fontFamilies.ui]: suitAsset,
  },
});
