import { StyleSheet, View } from 'react-native';
import { layoutRecipes } from '@/theme/tokens';
import { SettingsLinkRow } from './SettingsLinkRow';

export function SettingsMuteAndBlockNavigation({
  selected,
}: {
  selected?: 'blocked-profiles' | 'muted-profiles';
}) {
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
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
