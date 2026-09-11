import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsBlockedProfiles } from '@/components/settings/SettingsBlockedProfiles';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import type { View } from 'react-native';

export default function SettingsBlockedProfilesRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const shellChrome = useShellChrome();
  const routeHeadingRef = useRef<View>(null);
  const headingRef = detailHeaderMode === 'hidden' ? shellChrome?.pageHeadingRef : routeHeadingRef;
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="뮤트 및 차단으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/muted-profiles', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <>
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader headingRef={routeHeadingRef} leading={backButton} title="차단한 프로필" />
      ) : null}
      <SettingsBlockedProfiles headingRef={headingRef} />
    </>
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
});
