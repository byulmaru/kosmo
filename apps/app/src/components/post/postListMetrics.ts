import { Platform, useWindowDimensions } from 'react-native';
import { getShellLayout } from '@/components/shell/shellLayout';
import { spacing } from '@/theme/tokens';

export function getPostListMetrics(web: boolean, width: number) {
  const inset = getShellLayout(web, width) === 'mobile' ? spacing.lg : spacing.sm;

  return {
    connectorLeft: inset + spacing.xxxl / 2,
    inset,
  } as const;
}

export function usePostListMetrics() {
  const { width } = useWindowDimensions();

  return getPostListMetrics(Platform.OS === 'web', width);
}
