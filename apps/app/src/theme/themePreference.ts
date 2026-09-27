export type ThemePreference = 'dark' | 'light' | 'system';

export const THEME_PREFERENCE_STORAGE_KEY = 'kosmo.theme-preference';

export const themePreferenceOptions = [
  { description: '기기 색상 모드를 따라요.', label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
] as const satisfies readonly { description?: string; label: string; value: ThemePreference }[];

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function getThemePreferenceLabel(preference: ThemePreference): string {
  return themePreferenceOptions.find((option) => option.value === preference)?.label ?? '시스템';
}
