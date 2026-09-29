import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import licenses from '@/components/settings/openSourceLicenses.json';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';

export default function OpenSourceLicensesRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="정보로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/open-source-licenses', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <RouteScrollContainer
      nativeScrollProps={{ contentContainerStyle: styles.nativeContent, style: styles.nativeRoot }}
      webStyle={styles.webRoot}
    >
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader leading={backButton} title="오픈소스 라이선스" />
      ) : null}
      <View style={styles.content}>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          반응 이모지 이미지와 검색 데이터에 사용한 오픈소스의 저작권 고지 및 라이선스입니다.
        </Text>
        {licenses.map(({ license, name, text, version }) => (
          <View key={name} style={styles.license}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
              {name}
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {version} · {license}
            </Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{text}</Text>
          </View>
        ))}
      </View>
    </RouteScrollContainer>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
  content: {
    alignSelf: 'center',
    gap: spacing.xxxl,
    maxWidth: 840,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: '100%',
  },
  license: { gap: spacing.sm },
  title: { fontFamily: fontFamilies.ui, fontWeight: '800', ...typography.lg },
  description: { fontFamily: fontFamilies.ui, ...typography.md },
  body: { fontFamily: fontFamilies.ui, ...typography.sm },
});
