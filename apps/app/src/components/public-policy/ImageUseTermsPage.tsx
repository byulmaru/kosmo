import {
  MEDIA_USE_ATTRIBUTION_REQUIREMENT,
  MEDIA_USE_ORIGINAL_DESCRIPTION,
  MEDIA_USE_PERMISSION_DESCRIPTIONS,
  MEDIA_USE_PERMISSION_LABELS,
  MEDIA_USE_SCOPE_DESCRIPTIONS,
  MediaUsePermission,
} from '@kosmo/core/media-metadata';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PolicyCard, PolicyParagraph } from '@/components/public-policy/PublicPolicyDocument';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, space, textStyles } from '@/theme/tokens';
import type { MediaPublicationRights } from '@kosmo/core/media-metadata';
import type { Href } from 'expo-router';

const TITLE = 'KOSMO 이미지 이용 조건 v1';
const scopes = [
  'personal',
  'noncommercial',
  'commercial',
] as const satisfies readonly (keyof MediaPublicationRights)[];
const scopeTitles = {
  personal: '개인적 이용',
  noncommercial: '비상업적 이용',
  commercial: '상업적 이용',
} satisfies Record<(typeof scopes)[number], string>;
const permissions = [
  MediaUsePermission.DENY,
  MediaUsePermission.ORIGINAL,
  MediaUsePermission.EDIT,
] as const;

export function ImageUseTermsPage({ rights }: { rights: MediaPublicationRights | null }) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.backgroundCanvas }]}>
      <View style={styles.article}>
        <NavigationLink href={'/' as Href}>
          <Pressable
            accessibilityLabel="KOSMO로 돌아가기"
            accessibilityRole="link"
            style={styles.backLinkControl}
          >
            <Text style={[styles.backLink, { color: theme.foregroundSecondary }]}>
              KOSMO로 돌아가기
            </Text>
          </Pressable>
        </NavigationLink>
        {rights === null ? (
          <Text
            accessibilityRole="header"
            style={[styles.pageTitle, { color: theme.foregroundPrimary }]}
          >
            유효하지 않은 이미지 이용 조건입니다.
          </Text>
        ) : (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.pageTitle, { color: theme.foregroundPrimary }]}
            >
              {TITLE}
            </Text>
            <View style={styles.cards}>
              {scopes.map((scope) => (
                <PolicyCard key={scope} title={scopeTitles[scope]}>
                  <PolicyParagraph>{MEDIA_USE_SCOPE_DESCRIPTIONS[scope]}</PolicyParagraph>
                  <Text style={[styles.selectedPermission, { color: theme.foregroundPrimary }]}>
                    {MEDIA_USE_PERMISSION_LABELS[rights[scope]]}
                  </Text>
                </PolicyCard>
              ))}
            </View>
            <View style={styles.notes}>
              <PolicyCard title="출처 표시">
                <PolicyParagraph>{MEDIA_USE_ATTRIBUTION_REQUIREMENT}</PolicyParagraph>
              </PolicyCard>
              <PolicyCard title="이용 수준 안내">
                <View style={styles.definitions}>
                  {permissions.map((permission) => (
                    <View key={permission} style={styles.definition}>
                      <Text style={[styles.definitionTitle, { color: theme.foregroundPrimary }]}>
                        {MEDIA_USE_PERMISSION_LABELS[permission]}
                      </Text>
                      <PolicyParagraph>
                        {MEDIA_USE_PERMISSION_DESCRIPTIONS[permission]}
                      </PolicyParagraph>
                    </View>
                  ))}
                </View>
              </PolicyCard>
              <PolicyCard title="이미지 변경">
                <PolicyParagraph>{MEDIA_USE_ORIGINAL_DESCRIPTION}</PolicyParagraph>
              </PolicyCard>
              <PolicyCard title="AI 학습">
                <PolicyParagraph>
                  AI 모델 학습 목적의 이용은 선택한 조건과 관계없이 허용되지 않습니다.
                </PolicyParagraph>
              </PolicyCard>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: space[16], paddingVertical: space[48] },
  article: { alignSelf: 'center', maxWidth: 840, width: '100%' },
  backLinkControl: { justifyContent: 'center', minHeight: 48 },
  backLink: {
    fontFamily: fontFamilies.ui,
    marginBottom: space[24],
    textDecorationLine: 'underline',
    ...textStyles.uiCopyM,
  },
  pageTitle: { fontFamily: fontFamilies.ui, ...textStyles.uiHeadingM },
  cards: { gap: space[16], marginTop: space[32] },
  notes: { gap: space[24], marginTop: space[32] },
  selectedPermission: { fontFamily: fontFamilies.ui, ...textStyles.uiLabelL },
  definitions: { gap: space[12] },
  definition: { gap: space[4] },
  definitionTitle: { fontFamily: fontFamilies.ui, ...textStyles.uiLabelL },
});
