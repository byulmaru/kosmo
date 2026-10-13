import { Pressable, StyleSheet, Text } from 'react-native';
import {
  PolicyBullet,
  PolicyEmailLink,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';

const EFFECTIVE_DATE = '2026년 10월 13일';
const POLICY_TITLE = '개인정보처리방침 개정 안내';

export default function PrivacyChangeNoticeScreen() {
  const theme = useTheme();

  return (
    <PublicPolicyDocument
      currentPolicy="privacy"
      effectiveDate={EFFECTIVE_DATE}
      testID="privacy-change-notice"
      title={POLICY_TITLE}
    >
      <PolicyParagraph>
        이 안내는 2026년 9월 9일 시행한 이전 개인정보처리방침과 2026년 10월 13일 시행한 개정 방침의
        주요 차이를 정리한 것입니다.
      </PolicyParagraph>

      <PolicySection title="주요 변경 내용">
        <PolicyBullet>
          웹 이용 분석 관련 고지를 OpenPanel에서 PostHog Cloud 기준으로 바꾸고, 이전 방침의 세션
          리플레이 수집 항목을 삭제했습니다.
        </PolicyBullet>
        <PolicyBullet>
          PostHog의 국외 이전 고지를 추가해 이전받는 자, 독일(프랑크푸르트)로의 이전, 이전
          항목·목적·방법·보유기간과 법적 근거를 명시했습니다.
        </PolicyBullet>
        <PolicyBullet>
          분석 목적 달성·계정 삭제·이용자 요청 등을 기준으로 하던 분석 정보의 보유기간을
          변경했습니다. 일반 분석 이벤트는 수집일부터 12개월, 분석용 사용자 정보는 계정 이용 중과
          탈퇴 완료 후 30일 동안 보유하도록 구분했습니다.
        </PolicyBullet>
        <PolicyBullet>
          계정·프로필 정보, 게시글·관계 기록과 접속기록의 보유기간에 탈퇴 완료일부터 30일을
          명시했습니다. 진행 중인 신고·분쟁·수사기관 요청에 필요한 기록과 법정 보존 대상의 별도 보관
          기준도 정리했습니다.
        </PolicyBullet>
      </PolicySection>

      <PolicySection title="방침 전문 및 문의">
        <PolicyParagraph>
          자세한 처리 항목과 보유기간, 권리 행사 방법은 개인정보처리방침 전문에서 확인할 수
          있습니다. 문의는 아래 이메일로 보내주세요.
        </PolicyParagraph>
        <NavigationLink href={'/privacy' as Href}>
          <Pressable accessibilityRole="link" style={styles.policyLinkControl}>
            <Text style={[styles.policyLink, { color: theme.textSecondary }]}>
              현재 개인정보처리방침
            </Text>
          </Pressable>
        </NavigationLink>
        <NavigationLink href={'/privacy/2026-09-09' as Href}>
          <Pressable accessibilityRole="link" style={styles.policyLinkControl}>
            <Text style={[styles.policyLink, { color: theme.textSecondary }]}>
              이전 개인정보처리방침 (2026년 9월 9일 시행)
            </Text>
          </Pressable>
        </NavigationLink>
        <PolicyEmailLink />
      </PolicySection>
    </PublicPolicyDocument>
  );
}

const styles = StyleSheet.create({
  policyLinkControl: { justifyContent: 'center', minHeight: 48 },
  policyLink: { fontFamily: fontFamilies.ui, textDecorationLine: 'underline', ...typography.sm },
});
