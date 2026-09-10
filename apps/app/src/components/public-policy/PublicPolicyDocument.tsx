import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';

export type PublicPolicy = 'account-deletion' | 'child-safety' | 'privacy';

export function PublicPolicyDocument({
  children,
  currentPolicy,
  effectiveDate,
  testID,
  title,
}: PropsWithChildren<{
  currentPolicy: PublicPolicy;
  effectiveDate: string;
  testID: string;
  title: string;
}>) {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}
      testID={testID}
    >
      <Stack.Screen options={{ title }} />
      <View style={styles.article}>
        <NavigationLink href={'/' as Href}>
          <Pressable accessibilityRole="link" style={styles.backLinkControl}>
            <Text style={[styles.backLink, { color: theme.textSecondary }]}>KOSMO로 돌아가기</Text>
          </Pressable>
        </NavigationLink>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[styles.effectiveDate, { color: theme.textSecondary }]}>
          시행일: {effectiveDate}
        </Text>
        <PolicyNavigation currentPolicy={currentPolicy} />
        {children}
      </View>
    </ScrollView>
  );
}

function PolicyNavigation({ currentPolicy }: { currentPolicy: PublicPolicy }) {
  const theme = useTheme();

  return (
    <View accessibilityLabel="정책 문서" role="navigation" style={styles.policyNavigation}>
      {currentPolicy !== 'privacy' ? (
        <NavigationLink href={'/privacy' as Href}>
          <Pressable
            accessibilityLabel="개인정보 처리방침"
            accessibilityRole="link"
            style={styles.policyLinkControl}
          >
            <Text style={[styles.policyLink, { color: theme.textSecondary }]}>
              개인정보 처리방침
            </Text>
          </Pressable>
        </NavigationLink>
      ) : null}
      {currentPolicy !== 'account-deletion' ? (
        <NavigationLink href={'/account-deletion' as Href}>
          <Pressable
            accessibilityLabel="계정 삭제 안내"
            accessibilityRole="link"
            style={styles.policyLinkControl}
          >
            <Text style={[styles.policyLink, { color: theme.textSecondary }]}>계정 삭제 안내</Text>
          </Pressable>
        </NavigationLink>
      ) : null}
      {currentPolicy !== 'child-safety' ? (
        <NavigationLink href={'/child-safety' as Href}>
          <Pressable
            accessibilityLabel="아동 안전 정책"
            accessibilityRole="link"
            style={styles.policyLinkControl}
          >
            <Text style={[styles.policyLink, { color: theme.textSecondary }]}>아동 안전 정책</Text>
          </Pressable>
        </NavigationLink>
      ) : null}
    </View>
  );
}

export function PolicySection({ children, title }: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function PolicyParagraph({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.paragraph, { color: theme.textSecondary }]}>{children}</Text>;
}

export function PolicyEmailLink() {
  const theme = useTheme();
  return (
    <Link asChild href={'mailto:hello@byulmaru.co' as Href}>
      <Pressable
        accessibilityLabel="hello@byulmaru.co로 이메일 보내기"
        accessibilityRole="link"
        style={styles.emailLinkControl}
      >
        <Text style={[styles.emailLink, { color: theme.textSecondary }]}>hello@byulmaru.co</Text>
      </Pressable>
    </Link>
  );
}

export function PolicyBullet({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletMark, { color: theme.textSecondary }]}>•</Text>
      <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{children}</Text>
    </View>
  );
}

export function PolicyCard({ children, title }: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  article: { alignSelf: 'center', maxWidth: 840, width: '100%' },
  backLinkControl: { justifyContent: 'center', minHeight: 48 },
  backLink: { fontFamily: fontFamilies.ui, marginBottom: spacing.xl, ...typography.sm },
  emailLinkControl: { justifyContent: 'center', minHeight: 48 },
  emailLink: { fontFamily: fontFamilies.ui, textDecorationLine: 'underline', ...typography.md },
  title: { fontFamily: fontFamilies.ui, fontSize: 32, fontWeight: '800', lineHeight: 40 },
  effectiveDate: {
    fontFamily: fontFamilies.ui,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
    ...typography.sm,
  },
  policyNavigation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  policyLinkControl: { justifyContent: 'center', minHeight: 48 },
  policyLink: { fontFamily: fontFamilies.ui, textDecorationLine: 'underline', ...typography.sm },
  section: { gap: spacing.md, marginTop: spacing.xxxl },
  sectionTitle: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.xl },
  paragraph: { fontFamily: fontFamilies.ui, ...typography.md },
  card: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardTitle: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.md },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  bulletMark: { fontFamily: fontFamilies.ui, ...typography.md },
  bulletText: { flex: 1, fontFamily: fontFamilies.ui, ...typography.md },
});
