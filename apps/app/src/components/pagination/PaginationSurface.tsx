import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import type { RefObject } from 'react';
import type { StyleProp, View as NativeView, ViewStyle } from 'react-native';

type PaginationSurfaceProps = {
  endRef?: RefObject<NativeView | null>;
  error: boolean;
  errorMessage: string;
  hasNext: boolean;
  isLoading: boolean;
  loadingLabel: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function PaginationSurface({
  endRef,
  error,
  errorMessage,
  hasNext,
  isLoading,
  loadingLabel,
  onRetry,
  style,
}: PaginationSurfaceProps) {
  const theme = useTheme();
  const { showToast } = useToast();

  useEffect(() => {
    if (!error || !onRetry) {
      return;
    }
    return showToast(errorMessage, {
      action: { label: '다시 시도', onPress: onRetry },
      persistent: true,
      tone: 'danger',
    });
  }, [error, errorMessage, onRetry, showToast]);

  if (!hasNext) {
    return null;
  }
  if (!isLoading) {
    return <View ref={endRef} style={styles.sentinel} />;
  }

  return (
    <View ref={endRef} style={style}>
      <ActivityIndicator accessibilityLabel={loadingLabel} color={theme.foregroundSecondary} />
      <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
        {loadingLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sentinel: { height: 1 },
  srOnly: { height: 1, left: 0, overflow: 'hidden', position: 'absolute', top: 0, width: 1 },
});
