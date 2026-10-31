import { Link, useRouter } from 'expo-router';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsItem } from '@/components/settings/SettingsItem';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import openSourceLicenseData from '@/data/open-source-licenses.json';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, layoutRecipes, space, textStyles } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ViewStyle } from 'react-native';

export default function SettingsLicensesRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [focusedEntryKey, setFocusedEntryKey] = useState<string | null>(null);
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="정보로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/licenses', router)}
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
        <PageHeader leading={backButton} title="오픈소스 라이선스" />
      ) : null}
      <View style={[layoutRecipes.listStack, styles.root]}>
        {openSourceLicenseData.notices.map((entry) => {
          const entryKey = `${entry.name}@${entry.version}`;
          const expanded = expandedEntry === entryKey;

          return (
            <View key={entryKey}>
              <Pressable
                accessibilityLabel={`${entry.name}${entry.version ? `, 버전 ${entry.version}` : ''}, ${entry.license}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                aria-expanded={expanded}
                onBlur={() => setFocusedEntryKey(null)}
                onFocus={(event) => {
                  if (Platform.OS !== 'web') {
                    return;
                  }
                  const target = event.currentTarget as unknown as {
                    matches?: (selector: string) => boolean;
                  };
                  setFocusedEntryKey(target.matches?.(':focus-visible') ? entryKey : null);
                }}
                onPointerDown={() => setFocusedEntryKey(null)}
                onPress={() => setExpandedEntry(expanded ? null : entryKey)}
                style={() => [
                  styles.entry,
                  {
                    borderColor: 'transparent',
                    borderWidth: borderWidths[1],
                    outlineColor: focusedEntryKey === entryKey ? theme.stateFocusRing : undefined,
                    outlineOffset: 2,
                    outlineStyle: focusedEntryKey === entryKey ? 'solid' : 'none',
                    outlineWidth: focusedEntryKey === entryKey ? 2 : 0,
                  } as unknown as ViewStyle,
                ]}
              >
                {(state) => {
                  const hovered =
                    Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered);
                  const backgroundColor = state.pressed
                    ? theme.statePressed
                    : hovered
                      ? theme.stateHover
                      : expanded
                        ? theme.stateSelectedSurface
                        : 'transparent';

                  return (
                    <View style={[styles.rowSurface, { backgroundColor }]}>
                      <SettingsItem
                        description={`${entry.version ? `버전 ${entry.version}, ` : ''}${entry.license}`}
                        label={entry.name}
                        trailing={
                          <View accessibilityElementsHidden pointerEvents="none">
                            {expanded ? (
                              <ChevronDownIcon
                                color={theme.foregroundSecondary}
                                size={20}
                                strokeWidth={2}
                              />
                            ) : (
                              <ChevronRightIcon
                                color={theme.foregroundSecondary}
                                size={20}
                                strokeWidth={2}
                              />
                            )}
                          </View>
                        }
                      />
                    </View>
                  );
                }}
              </Pressable>
              {expanded ? (
                <View style={[layoutRecipes.formStack, styles.expandedContent]}>
                  {entry.text.length > 0 ? (
                    <Text
                      selectable
                      style={[textStyles.contentM, { color: theme.foregroundPrimary }]}
                    >
                      {entry.text}
                    </Text>
                  ) : (
                    <Text style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }]}>
                      라이선스 고지 미확인
                    </Text>
                  )}
                  <Link asChild href={entry.sourceUrl as Href}>
                    <Pressable
                      accessibilityLabel={`${entry.name} 출처 보기`}
                      accessibilityRole="link"
                      style={styles.sourceLink}
                    >
                      <Text style={[textStyles.uiLabelM, { color: theme.actionLinkBase }]}>
                        출처 보기
                      </Text>
                    </Pressable>
                  </Link>
                </View>
              ) : null}
            </View>
          );
        })}
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
  entry: { minHeight: 64, width: '100%' },
  expandedContent: {
    paddingHorizontal: space[16],
    paddingVertical: space[16],
  },
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
  root: { width: '100%' },
  rowSurface: { width: '100%' },
  sourceLink: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48 },
  webRoot: { minWidth: 0, width: '100%' },
});
