import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export default function LoginCallbackScreen() {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>로그인을 마무리하고 있어요</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        이 화면은 인증 브라우저가 자동으로 닫으면 함께 닫아도 됩니다.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  description: { fontFamily: 'SUIT', textAlign: 'center', ...typography.sm },
});
