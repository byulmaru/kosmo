import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { space } from '@/theme/tokens';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';

type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more'; onLoadMore: () => void }
  | { status: 'error'; onRetry: () => void };
export type BlockedProfileListState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'loaded'; children: ReactNode; pagination: Pagination }
  | { status: 'empty' };
type Props = { headingRef?: RefObject<NativeView | null>; state: BlockedProfileListState };

/** The action owner composes rows; this list does not execute relationship mutations. */
export function BlockedProfileList({ headingRef, state }: Props) {
  const { showToast } = useToast();
  const loadError =
    state.status === 'error'
      ? state
      : state.status === 'loaded' && state.pagination.status === 'error'
        ? state.pagination
        : null;
  const errorMessage = loadError
    ? state.status === 'error'
      ? '차단한 프로필을 불러오지 못했어요'
      : '프로필을 더 불러오지 못했어요'
    : null;
  const retry = loadError?.onRetry;
  const retryRef = useRef(retry);
  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);
  useEffect(() => {
    if (errorMessage) {
      return showToast(errorMessage, {
        tone: 'danger',
        action: {
          label: '다시 시도',
          onPress: () => {
            headingRef?.current?.focus();
            retryRef.current?.();
          },
        },
      });
    }
  }, [errorMessage, headingRef, showToast]);
  return (
    <View style={styles.root}>
      {state.status === 'loading' ? (
        <StateView loading title="차단한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <View style={styles.pagination}>
          <Button onPress={state.onRetry} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : state.status === 'empty' ? (
        <StateView title="차단한 프로필이 없어요" />
      ) : (
        <>
          {state.children}
          {state.pagination.status === 'error' ? (
            <View style={styles.pagination}>
              <Button onPress={state.pagination.onRetry} tone="secondary">
                더 불러오기
              </Button>
            </View>
          ) : state.pagination.status === 'loading' ? (
            <StateView loading title="프로필을 더 불러오는 중입니다." />
          ) : state.pagination.status === 'more' ? (
            <View style={styles.pagination}>
              <Button onPress={state.pagination.onLoadMore} tone="secondary">
                더 불러오기
              </Button>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  pagination: { alignItems: 'center', padding: space[16] },
});
