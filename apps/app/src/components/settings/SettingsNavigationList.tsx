import { StyleSheet, View } from 'react-native';
import { layoutRecipes } from '@/theme/tokens';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import { SettingsLinkRow } from './SettingsLinkRow';

type SettingsDestination = 'default-post-visibility' | 'mute-and-block' | 'info';

export function SettingsNavigationList({
  pathname,
  selected,
}: {
  pathname?: string;
  selected?: SettingsDestination;
}) {
  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <ByulmaruIdAccountSettingsEntry />
      <SettingsLinkRow
        accessibilityLabel="게시물 기본 공개 범위 설정 열기"
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위"
        primary
        currentPage={pathname === '/settings/default-post-visibility'}
        selected={selected === 'default-post-visibility'}
      />
      <SettingsLinkRow
        accessibilityLabel="뮤트 및 차단 설정 열기"
        href="/settings/mute-and-block"
        label="뮤트 및 차단"
        primary
        currentPage={pathname === '/settings/mute-and-block'}
        selected={selected === 'mute-and-block'}
      />
      <SettingsLinkRow
        accessibilityLabel="정보 설정 열기"
        href="/settings/info"
        label="정보"
        primary
        currentPage={pathname === '/settings/info'}
        selected={selected === 'info'}
      />
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
