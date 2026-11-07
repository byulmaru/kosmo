import { StyleSheet, View } from 'react-native';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { layoutRecipes } from '@/theme/tokens';
import { SettingsLinkRow } from './SettingsLinkRow';

export function SettingsMuteAndBlockNavigation({
  selected,
}: {
  selected?: 'blocked-profiles' | 'muted-profiles' | 'natural-language-mute';
}) {
  const naturalLanguageMuteSettingsEnabled = useFeatureFlag('natural-language-mute-settings');

  return (
    <View
      accessibilityLabel="뮤트 및 차단 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <SettingsLinkRow
        accessibilityLabel="뮤트한 프로필 관리 열기"
        href="/settings/muted-profiles"
        label="뮤트한 프로필"
        primary
        selected={selected === 'muted-profiles'}
      />
      <SettingsLinkRow
        accessibilityLabel="차단한 프로필 관리 열기"
        href="/settings/blocked-profiles"
        label="차단한 프로필"
        primary
        selected={selected === 'blocked-profiles'}
      />
      {naturalLanguageMuteSettingsEnabled ? (
        <SettingsLinkRow
          accessibilityLabel="스마트 뮤트 설정 열기"
          href="/settings/natural-language-mute"
          label="스마트 뮤트"
          primary
          selected={selected === 'natural-language-mute'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
