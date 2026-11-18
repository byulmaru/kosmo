import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/** Mount only while a query boundary is showing its error fallback. */
export function NativeResumeRetry({ onRetry }: { onRetry: () => void }) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (state) => {
      const resumed = state === 'active' && (previous === 'background' || previous === 'inactive');
      previous = state;
      if (resumed) {
        onRetry();
      }
    });
    return () => subscription.remove();
  }, [onRetry]);

  return null;
}
