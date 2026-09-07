import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import { ProfileBlockAction } from './ProfileBlockAction';
import { ProfileListItemContent } from './ProfileListItemContent';
import type { ProfileBlockFeedback } from './ProfileBlockAction';

export type BlockedProfile = { id: string; displayName: string; avatarUri?: string | null };
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more'; onLoadMore: () => void }
  | { status: 'error'; onRetry: () => void };
export type BlockedProfileListState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'loaded'; profiles: readonly BlockedProfile[]; pagination: Pagination };
type Props = {
  onDismiss?: (profileId: string) => void;
  onFeedback?: (feedback: ProfileBlockFeedback & { profileId: string }) => void;
  onUnblock: (profileId: string) => Promise<void>;
  state: BlockedProfileListState;
};

export function BlockedProfileList({ onDismiss, onFeedback, onUnblock, state }: Props) {
  const theme = useTheme();
  const headingRef = useRef<View>(null);
  const focusAfterUnblock = useRef(false);
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
            headingRef.current?.focus();
            retryRef.current?.();
          },
        },
      });
    }
  }, [errorMessage, showToast]);
  useEffect(() => {
    if (focusAfterUnblock.current) {
      headingRef.current?.focus();
      focusAfterUnblock.current = false;
    }
  }, [state]);
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View accessible accessibilityRole="header" ref={headingRef} tabIndex={-1}>
        <Text
          style={[
            styles.heading,
            { color: theme.foregroundPrimary, borderColor: theme.borderDefault },
          ]}
        >
          차단한 프로필
        </Text>
      </View>
      {state.status === 'loading' ? (
        <StateView loading title="차단한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <View style={styles.pagination}>
          <Button onPress={state.onRetry} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : state.profiles.length === 0 && state.pagination.status === 'end' ? (
        <StateView title="차단한 프로필이 없어요" />
      ) : (
        <>
          {state.profiles.map((profile) => (
            <ProfileListItemContent
              key={profile.id}
              avatarLabel={profile.displayName}
              avatarUri={profile.avatarUri}
              displayName={profile.displayName}
              style={styles.row}
            >
              <ProfileBlockAction
                blocked
                displayName={profile.displayName}
                onChangeBlocked={() => onUnblock(profile.id)}
                onDismiss={() => onDismiss?.(profile.id)}
                onFeedback={(feedback) => {
                  focusAfterUnblock.current = feedback.status === 'success';
                  onFeedback?.({ ...feedback, profileId: profile.id });
                }}
                profileId={profile.id}
                surface="button"
              />
            </ProfileListItemContent>
          ))}
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
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  root: { flexGrow: 1, width: '100%' },
  heading: { ...textStyles.uiHeadingM, borderBottomWidth: borderWidths[1], padding: space[16] },
  row: { height: 64, paddingVertical: 0 },
  pagination: { alignItems: 'center', padding: space[16] },
});
