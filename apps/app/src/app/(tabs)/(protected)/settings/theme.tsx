import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import {
  useSettingsDetailHeaderMode,
  useSettingsNavigationState,
} from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { themePreferenceOptions } from '@/theme/themePreference';
import { useSetThemePreference, useThemePreference } from '@/theme/ThemePreferenceProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, space, textStyles } from '@/theme/tokens';

export default function SettingsThemeRoute() {
  const router = useRouter();
  const theme = useTheme();
  const preference = useThemePreference();
  const setPreference = useSetThemePreference();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const navigationState = useSettingsNavigationState();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="설정으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/theme', router, navigationState)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.foregroundPrimary} size={20} strokeWidth={2} />
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
      {detailHeaderMode !== 'hidden' ? <PageHeader leading={backButton} title="테마" /> : null}
      <View style={[layoutRecipes.formStack, styles.root]}>
        <Text
          accessibilityRole="header"
          style={[textStyles.uiLabelL, { color: theme.foregroundPrimary }]}
        >
          테마 설정
        </Text>
        <RadioGroup accessibilityLabel="테마 설정" onChange={setPreference} value={preference}>
          {themePreferenceOptions.map((option) => (
            <RadioOption key={option.value} option={option} />
          ))}
        </RadioGroup>
        <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
          테마 설정은 이 기기에만 적용되며 다른 기기와 동기화되지 않아요.
        </Text>
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
  root: { padding: space[16], width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
});
