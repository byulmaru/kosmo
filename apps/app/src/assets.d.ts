declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType | string;
  export default source;
}
