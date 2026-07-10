import { ScrollView, StyleSheet, Text } from 'react-native';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export default function NotificationsScreen() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        알림
      </Text>
      <StateView description="새 알림이 생기면 이곳에서 알려드릴게요." title="아직 알림이 없어요" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  heading: { fontFamily: 'SUIT', fontWeight: '800', ...typography.xl },
});
