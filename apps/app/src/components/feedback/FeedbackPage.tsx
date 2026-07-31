import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { spacing } from '@/theme/tokens';
import { FeedbackForm } from './FeedbackForm';

export function FeedbackPage() {
  const web = Platform.OS === 'web';

  return (
    <ScrollView
      contentContainerStyle={web ? styles.webRoot : styles.nativeRoot}
      keyboardShouldPersistTaps="handled"
    >
      {web ? <PageHeader title="피드백 보내기" /> : null}
      {web ? (
        <View style={styles.webContent}>
          <FeedbackForm />
        </View>
      ) : (
        <FeedbackForm />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  webRoot: { flexGrow: 1, width: '100%' },
  webContent: {
    alignSelf: 'center',
    maxWidth: 600,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: '100%',
  },
  nativeRoot: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
});
