import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { MenuPageQuery } from './__generated__/MenuPageQuery.graphql';

const MenuQuery = graphql`
  query MenuPageQuery {
    ...ProfileSwitcher_query
  }
`;

export default function MenuScreen() {
  const theme = useTheme();
  const { revision } = useRelayActor();
  const data = useLazyLoadQuery<MenuPageQuery>(
    MenuQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-or-network' },
  );
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        메뉴
      </Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>프로필</Text>
        <ProfileSwitcher query={data} />
      </View>
      <StateView
        description="북마크, 팔로워 요청, 프로필 설정은 준비 중이에요."
        title="더 많은 기능을 준비하고 있어요"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, gap: spacing.lg, padding: spacing.lg },
  heading: { fontFamily: 'SUIT', fontWeight: '800', ...typography.xl },
  card: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  sectionTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
});
