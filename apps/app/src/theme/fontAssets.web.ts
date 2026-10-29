import { fontFamilies } from './tokens';

// Keep Web's production bundle on the package-provided Variable WOFF2 assets.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const pretendardAsset = require('pretendard/dist/web/variable/woff2/PretendardVariable.woff2');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro needs a static require for bundled assets.
const suitAsset = require('@sun-typeface/suit/fonts/variable/woff2/SUIT-Variable.woff2');

export const fontAssets: Record<string, number> = {
  [fontFamilies.content]: pretendardAsset,
  [fontFamilies.ui]: suitAsset,
};
