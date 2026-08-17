import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export const semanticColors = {
  light: {
    actionLinkBase: '#4F46E5',
    actionLinkHover: '#4338CA',
    actionLinkPressed: '#3730A3',
    actionPrimaryBase: '#FFE597',
    actionPrimaryDisabled: '#F4F4F5',
    actionPrimaryHover: '#F3C745',
    actionPrimaryOnBase: '#1A1A1A',
    actionPrimaryOnDisabled: '#A5A5AF',
    actionPrimaryOnSubtle: '#1A1A1A',
    actionPrimaryPressed: '#DFAA17',
    actionPrimarySubtle: '#FFF9E6',
    actionSecondaryBase: '#FAFAFB',
    actionSecondaryBorder: '#DFDFE5',
    actionSecondaryHover: 'rgba(0, 0, 0, 0.04)',
    actionSecondaryOnBase: '#1A1A1A',
    actionSecondaryPressed: 'rgba(0, 0, 0, 0.08)',
    backgroundCanvas: '#FFFFFF',
    backgroundElevated: '#FFFFFF',
    backgroundInverse: '#1A1A1A',
    backgroundSurface: '#FAFAFB',
    borderDefault: '#DFDFE5',
    borderDisabled: '#F4F4F5',
    borderFocus: '#4F46E5',
    borderStrong: '#A5A5AF',
    borderSubtle: '#ECECF0',
    brandInk: '#1A1A1A',
    brandPurple: '#8B7DEA',
    brandYellow: '#FFE597',
    feedbackDangerBase: '#B42318',
    feedbackDangerBorder: '#B42318',
    feedbackDangerOnBase: '#FFFFFF',
    feedbackDangerOnSubtle: '#7A271A',
    feedbackDangerSubtle: '#FEE4E2',
    feedbackInfoBase: '#8B7DEA',
    feedbackInfoBorder: '#8477DE',
    feedbackInfoOnBase: '#1A1A1A',
    feedbackInfoOnSubtle: '#4C3AAE',
    feedbackInfoSubtle: '#F1EEFF',
    feedbackSuccessBase: '#16794A',
    feedbackSuccessBorder: '#16794A',
    feedbackSuccessOnBase: '#FFFFFF',
    feedbackSuccessOnSubtle: '#14532D',
    feedbackSuccessSubtle: '#DCFCE7',
    feedbackWarningBase: '#E97B35',
    feedbackWarningBorder: '#CF6D2F',
    feedbackWarningOnBase: '#1A1A1A',
    feedbackWarningOnSubtle: '#743405',
    feedbackWarningSubtle: '#FFF2E8',
    fixedBlack: '#000000',
    fixedWhite: '#FFFFFF',
    foregroundDisabled: '#A5A5AF',
    foregroundInverse: '#FAFAFB',
    foregroundMuted: '#71717A',
    foregroundPrimary: '#1A1A1A',
    foregroundSecondary: '#64646F',
    overlayScrim: 'rgba(0, 0, 0, 0.45)',
    stateDisabledForeground: '#A5A5AF',
    stateDisabledSurface: '#F4F4F5',
    stateFocusRing: '#4F46E5',
    stateHover: 'rgba(0, 0, 0, 0.04)',
    statePressed: 'rgba(0, 0, 0, 0.08)',
    stateSelectedBorder: '#AE8512',
    stateSelectedSurface: '#FFF9E6',
  },
  dark: {
    actionLinkBase: '#A5B4FC',
    actionLinkHover: '#C7D2FE',
    actionLinkPressed: '#818CF8',
    actionPrimaryBase: '#FFE597',
    actionPrimaryDisabled: '#2B2B31',
    actionPrimaryHover: '#F3C745',
    actionPrimaryOnBase: '#1A1A1A',
    actionPrimaryOnDisabled: '#64646F',
    actionPrimaryOnSubtle: '#FFE597',
    actionPrimaryPressed: '#DFAA17',
    actionPrimarySubtle: '#3A331A',
    actionSecondaryBase: '#222226',
    actionSecondaryBorder: '#44444C',
    actionSecondaryHover: 'rgba(255, 255, 255, 0.08)',
    actionSecondaryOnBase: '#F4F4F5',
    actionSecondaryPressed: 'rgba(255, 255, 255, 0.12)',
    backgroundCanvas: '#18181B',
    backgroundElevated: '#2B2B31',
    backgroundInverse: '#FAFAFB',
    backgroundSurface: '#222226',
    borderDefault: '#44444C',
    borderDisabled: '#2B2B31',
    borderFocus: '#A5B4FC',
    borderStrong: '#71717A',
    borderSubtle: '#34343A',
    brandInk: '#1A1A1A',
    brandPurple: '#8B7DEA',
    brandYellow: '#FFE597',
    feedbackDangerBase: '#B42318',
    feedbackDangerBorder: '#FECDCA',
    feedbackDangerOnBase: '#FFFFFF',
    feedbackDangerOnSubtle: '#FECDCA',
    feedbackDangerSubtle: '#4A1714',
    feedbackInfoBase: '#8B7DEA',
    feedbackInfoBorder: '#CFC8FF',
    feedbackInfoOnBase: '#1A1A1A',
    feedbackInfoOnSubtle: '#CFC8FF',
    feedbackInfoSubtle: '#2F2858',
    feedbackSuccessBase: '#16794A',
    feedbackSuccessBorder: '#A6F4C5',
    feedbackSuccessOnBase: '#FFFFFF',
    feedbackSuccessOnSubtle: '#A6F4C5',
    feedbackSuccessSubtle: '#123D26',
    feedbackWarningBase: '#E97B35',
    feedbackWarningBorder: '#FFD0A3',
    feedbackWarningOnBase: '#1A1A1A',
    feedbackWarningOnSubtle: '#FFD0A3',
    feedbackWarningSubtle: '#4A280D',
    fixedBlack: '#000000',
    fixedWhite: '#FFFFFF',
    foregroundDisabled: '#64646F',
    foregroundInverse: '#1A1A1A',
    foregroundMuted: '#9898A2',
    foregroundPrimary: '#F4F4F5',
    foregroundSecondary: '#A5A5AF',
    overlayScrim: 'rgba(0, 0, 0, 0.45)',
    stateDisabledForeground: '#64646F',
    stateDisabledSurface: '#2B2B31',
    stateFocusRing: '#A5B4FC',
    stateHover: 'rgba(255, 255, 255, 0.08)',
    statePressed: 'rgba(255, 255, 255, 0.12)',
    stateSelectedBorder: '#FFE597',
    stateSelectedSurface: '#3A331A',
  },
} as const;

const legacyColors = {
  light: {
    background: '#ffffff',
    surface: '#f6f6f6',
    card: '#ffffff',
    text: '#111111',
    textSecondary: '#777777',
    border: '#eaeaea',
    divider: '#f2f2f2',
    primary: '#fce79a',
    primarySubtle: 'rgba(252, 231, 154, 0.3)',
    primaryHover: '#f9dc6d',
    selectedSurface: '#fff8dc',
    selectedBorder: '#9a7800',
    focus: '#9a7800',
    accent: '#262626',
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
    divider: '#292929',
    primary: '#fce79a',
    primarySubtle: 'rgba(252, 231, 154, 0.3)',
    primaryHover: '#f9dc6d',
    selectedSurface: '#3a3524',
    selectedBorder: '#fce79a',
    focus: '#fce79a',
    accent: '#ffffff',
    danger: '#aa1010',
    like: '#fcd5cf',
    more: '#61a3f9',
  },
} as const;

export const colors = {
  light: { ...legacyColors.light, ...semanticColors.light },
  dark: { ...legacyColors.dark, ...semanticColors.dark },
} as const;

export const space = {
  0: 0,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
  48: 48,
} as const;

/** @deprecated Use numeric `space` tokens for new work. */
export const spacing = {
  xs: space[4],
  sm: space[8],
  md: space[12],
  lg: space[16],
  xl: space[24],
  xxl: space[32],
  xxxl: space[48],
} as const;

export const radius = {
  0: 0,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  full: 999,
} as const;

/** @deprecated Use numeric `radius` tokens for new work. */
export const radii = {
  sm: radius[8],
  md: radius[12],
  lg: radius[16],
  xl: radius[24],
  full: radius.full,
} as const;

export const borderWidths = { 0: 0, 1: 1, 2: 2 } as const;
export const iconSizes = { 16: 16, 18: 18, 20: 20, 24: 24, 48: 48, 64: 64 } as const;

export const fontFamilies = { content: 'Pretendard', ui: 'SUIT' } as const;
export const fontSizes = {
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
} as const;
export const fontWeights = { normal: '400', semibold: '600', bold: '700' } as const;
export const lineHeights = { tight: 1.15, snug: 1.3, relaxed: 1.5 } as const;

const textStyle = (
  fontFamily: string,
  fontSize: number,
  lineHeightRatio: number,
  fontWeight: TextStyle['fontWeight'],
): TextStyle => ({ fontFamily, fontSize, fontWeight, lineHeight: fontSize * lineHeightRatio });

export const textStyles = {
  contentM: textStyle(fontFamilies.content, fontSizes[16], lineHeights.relaxed, fontWeights.normal),
  uiCopyL: textStyle(fontFamilies.ui, fontSizes[16], lineHeights.relaxed, fontWeights.normal),
  uiCopyM: textStyle(fontFamilies.ui, fontSizes[14], lineHeights.relaxed, fontWeights.normal),
  uiCopyS: textStyle(fontFamilies.ui, fontSizes[12], lineHeights.snug, fontWeights.normal),
  uiHeadingM: textStyle(fontFamilies.ui, fontSizes[24], lineHeights.tight, fontWeights.bold),
  uiHeadingS: textStyle(fontFamilies.ui, fontSizes[20], lineHeights.snug, fontWeights.bold),
  uiLabelL: textStyle(fontFamilies.ui, fontSizes[16], lineHeights.relaxed, fontWeights.semibold),
  uiLabelM: textStyle(fontFamilies.ui, fontSizes[14], lineHeights.relaxed, fontWeights.semibold),
  uiLabelS: textStyle(fontFamilies.ui, fontSizes[12], lineHeights.snug, fontWeights.semibold),
} satisfies Record<string, TextStyle>;

/** @deprecated Use role-based `textStyles` for new work. */
export const typography = {
  xsm: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  md: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 20, lineHeight: 30 },
  xl: { fontSize: 24, lineHeight: 32 },
} satisfies Record<string, TextStyle>;

export const breakpoints = { compact: 768, full: 1280 } as const;

const shadowStyle = (value: string): ViewStyle => ({ boxShadow: value });

export const elevations = {
  light: {
    flat: {},
    raised: shadowStyle('0 2px 8px 0 rgba(0, 0, 0, 0.1)'),
    floating: shadowStyle('0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'),
    overlay: shadowStyle('0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'),
  },
  dark: {
    flat: {},
    raised: shadowStyle('0 2px 8px 0 rgba(0, 0, 0, 0.4)'),
    floating: shadowStyle('0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)'),
    overlay: shadowStyle('0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.4)'),
  },
} satisfies Record<ThemeMode, Record<'flat' | 'floating' | 'overlay' | 'raised', ViewStyle>>;

/** @deprecated Use a named value from `elevations`. */
export const shadow: ViewStyle = { boxShadow: '0 12px 36px rgba(0, 0, 0, 0.12)' };

const motionEasingPoints = {
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  standard: [0.17, 0.73, 0.14, 1],
} as const;

const cubicBezier = (points: readonly number[]) => `cubic-bezier(${points.join(', ')})`;

export const motion = {
  duration: {
    emphasized: 360,
    fast: 120,
    instant: 0,
    loadingCycle: 800,
    reaction: 300,
    standard: 200,
  },
  easing: {
    enter: cubicBezier(motionEasingPoints.enter),
    exit: cubicBezier(motionEasingPoints.exit),
    linear: 'linear',
    standard: cubicBezier(motionEasingPoints.standard),
  },
  easingPoints: motionEasingPoints,
} as const;

export type ThemeColors = Record<keyof (typeof colors)['light'], string>;
