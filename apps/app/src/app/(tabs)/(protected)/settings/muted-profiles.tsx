import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { SettingsMutedProfiles } from '@/components/settings/SettingsMutedProfiles';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import {
  useSettingsDetailHeaderMode,
  useSettingsNavigationState,
} from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsMutedProfilesRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const navigationState = useSettingsNavigationState();
  const headingRef = useRef<View>(null);
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="뮤트 및 차단으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/muted-profiles', router, navigationState)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <PaginationScrollView
      nativeScrollProps={{
        contentContainerStyle: styles.nativeContent,
        style: styles.nativeRoot,
      }}
      webStyle={styles.webRoot}
    >
      <View
        accessibilityLabel={detailHeaderMode === 'hidden' ? '뮤트한 프로필' : undefined}
        accessibilityRole={detailHeaderMode === 'hidden' ? 'header' : undefined}
        ref={headingRef}
        style={detailHeaderMode === 'hidden' ? styles.hiddenHeading : undefined}
        tabIndex={-1}
        testID="mute-heading-focus"
      >
        {detailHeaderMode !== 'hidden' ? (
          <PageHeader leading={backButton} title="뮤트한 프로필" />
        ) : null}
      </View>
      <SettingsMutedProfiles onUnmuteSuccess={() => headingRef.current?.focus()} />
    </PaginationScrollView>
  );
}

const styles = StyleSheet.create({
  hiddenHeading: { height: 1, left: 0, overflow: 'hidden', position: 'absolute', width: 1 },
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
});
