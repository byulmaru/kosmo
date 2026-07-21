import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  light: {
    background: '#ffffff',
    surface: '#f6f6f6',
    card: '#ffffff',
    text: '#111111',
    textSecondary: '#777777',
    border: '#eaeaea',
    primary: '#fce79a',
    primaryHover: '#f9dc6d',
    accent: '#111111',
    onAccent: '#ffffff',
    danger: '#aa1010',
    like: '#fcd5cf',
    more: '#61a3f9',
  },
  dark: {
    background: '#111111',
    surface: '#222222',
    card: '#1c1c1e',
    text: '#ffffff',
    textSecondary: '#777777',
    border: '#333333',
    primary: '#fce79a',
    primaryHover: '#f9dc6d',
    accent: '#ffffff',
    onAccent: '#111111',
    danger: '#aa1010',
    like: '#fcd5cf',
    more: '#61a3f9',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  xsm: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  md: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 20, lineHeight: 30 },
  xl: { fontSize: 24, lineHeight: 32 },
  display: { fontSize: 44, lineHeight: 48 },
} satisfies Record<string, TextStyle>;

export const breakpoints = {
  compact: 768,
  full: 1280,
} as const;

export const shadow: ViewStyle = {
  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.12)',
};

export type ThemeColors = Record<keyof (typeof colors)['light'], string>;
