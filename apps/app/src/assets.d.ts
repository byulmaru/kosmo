declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType | string;
  export default source;
}

declare module '*.png?url' {
  const url: string;
  export default url;
}
