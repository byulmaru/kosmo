import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import { ProfileListItemContent } from './ProfileListItemContent';
import { ProfileMuteAction } from './ProfileMuteAction';
import type { ProfileMuteFeedback } from './ProfileMuteAction';

export type MutedProfile = { id: string; displayName: string; avatarUri?: string | null };
type Pagination =
  | { status: 'end' }
  | { status: 'loading' }
  | { status: 'more'; onLoadMore: () => void }
  | { status: 'error'; onRetry: () => void };
export type MutedProfileListState =
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'loaded'; profiles: readonly MutedProfile[]; pagination: Pagination };
type Props = {
  onFeedback?: (feedback: ProfileMuteFeedback & { profileId: string }) => void;
  onUnmute: (profileId: string) => Promise<void>;
  state: MutedProfileListState;
};

export function MutedProfileList({ onFeedback, onUnmute, state }: Props) {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text
        accessibilityRole="header"
        style={[
          styles.heading,
          { color: theme.foregroundPrimary, borderColor: theme.borderDefault },
        ]}
      >
        뮤트한 프로필
      </Text>
      {state.status === 'loading' ? (
        <StateView loading title="뮤트한 프로필을 불러오는 중입니다." />
      ) : state.status === 'error' ? (
        <StateView
          alert
          title="뮤트한 프로필을 불러오지 못했어요"
          actionLabel="다시 시도"
          onAction={state.onRetry}
        />
      ) : state.profiles.length === 0 && state.pagination.status === 'end' ? (
        <StateView title="뮤트한 프로필이 없어요" />
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
              <ProfileMuteAction
                displayName={profile.displayName}
                muted
                onChangeMuted={() => onUnmute(profile.id)}
                onFeedback={(feedback) => onFeedback?.({ ...feedback, profileId: profile.id })}
                profileId={profile.id}
                surface="button"
              />
            </ProfileListItemContent>
          ))}
          {state.pagination.status === 'error' ? (
            <StateView
              alert
              title="프로필을 더 불러오지 못했어요"
              actionLabel="다시 시도"
              onAction={state.pagination.onRetry}
            />
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
