import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { RightRail_profile$key } from './__generated__/RightRail_profile.graphql';

const RightRailFragment = graphql`
  fragment RightRail_profile on Profile {
    handle
    displayName
    relativeHandle
  }
`;

export function RightRail({ profile: profileKey }: { profile: RightRail_profile$key }) {
  const theme = useTheme();
  const router = useRouter();
  const profile = useFragment(RightRailFragment, profileKey);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>빠른 글쓰기</Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        {profile.relativeHandle} 계정으로 새 소식을 공유하세요.
      </Text>
      <Button onPress={() => router.push('/compose')}>글쓰기</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  title: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  description: { fontFamily: 'SUIT', ...typography.sm },
});
