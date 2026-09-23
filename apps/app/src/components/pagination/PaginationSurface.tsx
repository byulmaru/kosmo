import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type PaginationSurfaceProps = {
  actionStyle?: StyleProp<ViewStyle>;
  actionAccessibilityLabel?: string;
  children?: ReactNode;
  error?: boolean;
  hasNext: boolean;
  isLoading?: boolean;
  loadMoreLabel: string;
  loadingIndicator?: boolean;
  loadingLabel: string;
  onLoadMore?: () => void;
  onRetry?: () => void;
  retryLabel: string;
  retryTone?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function PaginationSurface({
  actionAccessibilityLabel,
  actionStyle,
  children,
  error = false,
  hasNext,
  isLoading = false,
  loadingIndicator = false,
  loadMoreLabel,
  loadingLabel,
  onLoadMore,
  onRetry,
  retryLabel,
  retryTone,
  style,
}: PaginationSurfaceProps) {
  const action = error ? onRetry : onLoadMore;
  if (!error && (!hasNext || !action)) {
    return null;
  }

  const label = error ? retryLabel : isLoading ? loadingLabel : loadMoreLabel;
  const handlePress = () => {
    if (!isLoading) {
      action?.();
    }
  };

  return (
    <View style={style}>
      {children}
      {action ? (
        <Button
          accessibilityLabel={actionAccessibilityLabel}
          accessibilityState={{ busy: isLoading, disabled: isLoading }}
          aria-busy={isLoading}
          disabled={isLoading}
          loading={isLoading && loadingIndicator}
          onPress={handlePress}
          style={actionStyle}
          tone={error ? (retryTone ?? 'secondary') : 'secondary'}
        >
          {label}
        </Button>
      ) : null}
    </View>
  );
}
