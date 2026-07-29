import { ScrollView, StyleSheet } from 'react-native';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { spacing } from '@/theme/tokens';

export default function FeedbackScreen() {
  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <FeedbackForm />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
});
