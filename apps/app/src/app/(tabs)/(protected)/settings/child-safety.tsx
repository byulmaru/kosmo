import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import {
  CHILD_SAFETY_POLICY_EFFECTIVE_DATE,
  CHILD_SAFETY_POLICY_TITLE,
  ChildSafetyPolicyContent,
} from '@/components/public-policy/ChildSafetyPolicyContent';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';

export default function SettingsChildSafetyRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="정보로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/child-safety', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <RouteScrollContainer
      nativeScrollProps={{
        contentContainerStyle: styles.nativeContent,
        style: styles.nativeRoot,
      }}
      webStyle={styles.webRoot}
    >
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader leading={backButton} title={CHILD_SAFETY_POLICY_TITLE} />
      ) : null}
      <View style={styles.article}>
        <Text style={[styles.effectiveDate, { color: theme.textSecondary }]}>
          시행일: {CHILD_SAFETY_POLICY_EFFECTIVE_DATE}
        </Text>
        <ChildSafetyPolicyContent />
      </View>
    </RouteScrollContainer>
  );
}

const styles = StyleSheet.create({
  article: { alignSelf: 'center', maxWidth: 840, padding: spacing.lg, width: '100%' },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
  effectiveDate: {
    fontFamily: fontFamilies.ui,
    marginBottom: spacing.xl,
    textAlign: 'right',
    ...typography.sm,
  },
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
});
