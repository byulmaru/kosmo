import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  PolicyBullet,
  PolicyEmailLink,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

const EFFECTIVE_DATE = '2026년 10월 13일';
const POLICY_TITLE = 'Kosmo 개인정보 처리방침';

function PolicyTable({
  headers,
  minWidth,
  rows,
}: {
  headers: readonly string[];
  minWidth: number;
  rows: readonly (readonly string[])[];
}) {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.tableContent} horizontal tabIndex={0}>
      <View
        role={Platform.OS === 'web' ? 'table' : undefined}
        style={[styles.table, { borderColor: theme.border, minWidth }]}
      >
        <TableRow cells={headers} header />
        {rows.map((cells, index) => (
          <TableRow cells={cells} headers={headers} key={index} />
        ))}
      </View>
    </ScrollView>
  );
}

function TableRow({
  cells,
  header = false,
  headers,
}: {
  cells: readonly string[];
  header?: boolean;
  headers?: readonly string[];
}) {
  const theme = useTheme();
  return (
    <View
      role={Platform.OS === 'web' ? 'row' : undefined}
      style={[styles.tableRow, { backgroundColor: header ? theme.surface : theme.background }]}
    >
      {cells.map((cell, index) => (
        <Text
          accessibilityLabel={
            Platform.OS !== 'web' && !header && headers ? `${headers[index]}: ${cell}` : undefined
          }
          role={Platform.OS === 'web' ? (header ? 'columnheader' : 'cell') : undefined}
          key={`${index}-${cell}`}
          style={[
            styles.tableCell,
            { borderColor: theme.border, color: header ? theme.text : theme.textSecondary },
            header && styles.tableHeaderCell,
          ]}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
}

function NumberedItem({ children, number }: { children: ReactNode; number: number }) {
  const theme = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletMark, { color: theme.textSecondary }]}>{number}.</Text>
      <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const theme = useTheme();

  return (
    <PublicPolicyDocument
      currentPolicy="privacy"
      effectiveDate={EFFECTIVE_DATE}
      testID="privacy-policy"
      title={POLICY_TITLE}
    >
      <PolicySection title="1. 개인정보의 처리 목적·항목·보유기간">
        <PolicyParagraph>
          별마루는 아래 개인정보를 별도의 동의 없이 표에 기재한 법적 근거에 따라 처리합니다.
        </PolicyParagraph>
        <PolicyTable
          headers={['처리 항목', '처리 목적', '보유 기간', '개인정보 처리의 법적 근거']}
          minWidth={900}
          rows={[
            [
              '계정·프로필 식별자, 사용자 이름·표시명·소개·프로필 이미지와 선택 정보',
              '로그인·이용자 식별과 프로필 관리',
              '탈퇴 완료일부터 30일',
              '개인정보 보호법 제15조 제1항 제4호(계약 이행)',
            ],
            [
              '프로필과 연결된 콘텐츠·공개 범위, 팔로우·반응·북마크·알림 기록과 작성·변경 시각',
              '콘텐츠 게시·공유와 이용자 간 상호작용',
              '콘텐츠 삭제·관계 종료 또는 목적 달성 시까지. 탈퇴 완료일부터 30일',
              '개인정보 보호법 제15조 제1항 제4호(계약 이행)',
            ],
            [
              '세션 식별자, 접속 시각·IP 주소·요청·오류 기록, 기기·운영체제·브라우저 정보',
              '로그인 유지·오류 조사·부정 이용 방지',
              '이용 중 보안·오류 조사에 필요한 기간. 탈퇴 완료일부터 30일',
              '개인정보 보호법 제15조 제1항 제6호(서비스 보호를 위한 정당한 이익)',
            ],
            [
              '페이지 주소·유입 경로(검색어가 포함될 수 있음), 클릭·스크롤 등 이용 기록, 기기·운영체제·브라우저 정보, 접속 시각·분석 식별자',
              '서비스 이용 분석·개선(맞춤형 광고에 사용하지 않음)',
              '일반 분석 이벤트는 수집일부터 12개월',
              '개인정보 보호법 제15조 제1항 제6호(서비스 개선을 위한 정당한 이익)',
            ],
            [
              '분석용 사용자 정보(계정 식별자, 연결된 분석 식별자, 프로필 개수)',
              '계정별 이용 기록 연결과 서비스 이용 분석',
              '계정 이용 기간 및 탈퇴 완료일부터 30일',
              '개인정보 보호법 제15조 제1항 제6호(서비스 개선을 위한 정당한 이익)',
            ],
            [
              '이메일 주소, 문의·요청 내용, 본인 확인 정보·처리 결과',
              '문의 답변·권리 행사·분쟁 대응',
              '처리 완료 후 분쟁 대응에 필요한 기간 또는 법령상 기간',
              '개인정보 보호법 제15조 제1항 제4호·제6호 및 관계 법령상 의무',
            ],
          ]}
        />
        <PolicyParagraph>
          정보는 이용자가 직접 입력하거나 서비스 이용 중 생성되며, 문의 정보는 이메일로 수집합니다.
          웹·앱 이용 분석 정보는 PostHog를 통해 수집하며, 로그인한 경우 계정·프로필 식별자와 이용
          기록을 연결합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="2. 개인정보의 제3자 제공">
        <PolicyParagraph>
          이용자가 공개·연합형 기능을 이용하면 다음 정보를 외부 서버에 제공할 수 있습니다.
        </PolicyParagraph>
        <PolicyTable
          headers={['제공받는 자', '제공 목적', '제공 항목', '보유 기간']}
          minWidth={860}
          rows={[
            [
              '연합형 소셜 네트워크의 외부 서버 운영자',
              '이용자가 요청한 연합형 소셜 기능 제공',
              '공개한 프로필·콘텐츠, 프로필 식별자·콘텐츠 주소와 관계·활동 기록',
              '외부 서버 정책에 따르며, 보관·재공개될 수 있습니다.',
            ],
          ]}
        />
        <PolicyParagraph>
          법령에 따른 적법한 요청이 있으면 해당 법령에 따라 제공할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="3. 개인정보 처리 업무의 위탁">
        <PolicyTable
          headers={['수탁자', '위탁 업무']}
          minWidth={640}
          rows={[
            ['Amazon Web Services, Inc.', '서비스 인프라 운영과 데이터 보관'],
            ['Oracle Corporation', '서비스 인프라 운영과 데이터 보관'],
            ['Cloudflare, Inc.', '네트워크 전송, 보안과 콘텐츠 제공'],
            ['PostHog, Inc.', '제품 이용 분석 서비스'],
          ]}
        />
      </PolicySection>

      <PolicySection title="4. 개인정보의 국외 이전">
        <PolicyParagraph>
          Cloudflare 이전은 개인정보 보호법 제28조의8 제1항 제3호 가목에 따른 계약 이행 목적의
          처리위탁입니다. PostHog 이전은 같은 항 제5호에 따라 보호위원회가 동등한 보호 수준을 인정한
          유럽연합으로 이루어집니다.
        </PolicyParagraph>
        <PolicyTable
          headers={[
            '이전받는 자',
            '이전 국가',
            '이전 항목과 목적',
            '이전 시기와 방법',
            '보유 기간',
          ]}
          minWidth={1100}
          rows={[
            [
              'Cloudflare, Inc.\ndpo@cloudflare.com',
              '미국 및 유럽경제지역',
              '접속·전송 정보의 서비스 제공과 보안',
              '서비스 이용 시 암호화된 네트워크로 전송',
              '위탁계약 종료 또는 처리 목적 달성 시까지',
            ],
            [
              'PostHog, Inc.\nprivacy@posthog.com',
              '독일(프랑크푸르트)',
              '1절의 웹·앱 이용 분석 이벤트와 분석용 사용자 정보, 서비스 이용 분석 목적',
              '서비스 이용 시 암호화된 네트워크로 지속적으로 전송',
              '일반 분석 이벤트는 수집일부터 12개월, 분석용 사용자 정보는 계정 이용 기간 및 탈퇴 완료일부터 30일',
            ],
          ]}
        />
        <PolicyParagraph>
          국외 이전의 거부·제한은 hello@byulmaru.co로 요청할 수 있습니다. Cloudflare 이전을 거부하면
          네트워크·보안·콘텐츠 제공이 제한되어 서비스의 전부 또는 일부를 이용하기 어려울 수
          있습니다. PostHog 전송은 본인 확인 후 제한하고 처리 결과를 안내합니다. 웹에서는 브라우저
          추적 방지 기능으로도 분석 전송을 제한할 수 있으며, 분석 제한은 핵심 기능 이용에 영향을
          주지 않습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="5. 개인정보의 파기">
        <NumberedItem number={1}>
          보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 파기합니다. 다만 진행 중인 신고·분쟁·
          수사기관 요청에 필요한 기록은 필요한 기간만 보관하고, 필요성이 끝나면 지체 없이
          파기합니다.
        </NumberedItem>
        <NumberedItem number={2}>
          법령상 보관 대상은 다른 개인정보와 분리해 정해진 기간 동안 보관한 뒤 파기합니다.
        </NumberedItem>
        <NumberedItem number={3}>
          전자 기록은 복구하기 어렵게 삭제하며, 백업은 정해진 순환 주기에 따라 삭제합니다.
        </NumberedItem>
      </PolicySection>

      <PolicySection title="6. 이용자와 법정대리인의 권리">
        <PolicyParagraph>
          이용자와 법정대리인은 개인정보의 열람·전송·정정·삭제·처리정지 또는 동의 철회를 요청할 수
          있습니다. 요청은 아래 이메일로 접수하며, 본인 또는 정당한 대리인인지 확인한 뒤 법령에 따라
          처리합니다. 법령상 제한 사유가 있으면 이유를 안내합니다.
        </PolicyParagraph>
        <PolicyEmailLink />
      </PolicySection>

      <PolicySection title="7. 자동 수집 장치의 설치·운영 및 거부">
        <PolicyParagraph>
          Kosmo는 로그인 유지·보안과 이용 분석을 위해 쿠키 또는 브라우저 저장소를 사용할 수
          있습니다. 브라우저 설정으로 저장을 차단하거나 삭제할 수 있으며, 로그인 유지 등 일부 기능이
          제한될 수 있습니다. 브라우저 추적 방지 기능으로 분석 전송을 제한해도 핵심 기능은 계속
          이용할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="8. 개인정보의 안전성 확보">
        <PolicyParagraph>
          개인정보 접근권한 최소화, 전송 구간 암호화, 비밀정보 분리, 접속기록 관리, 취약점·권한의
          정기 점검과 침해사고 대응 절차를 운영합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="9. 개인정보 보호책임자 및 권익침해 구제">
        <PolicyBullet>개인정보 보호책임자: 박지유</PolicyBullet>
        <PolicyEmailLink />
        <PolicyParagraph>
          개인정보 침해 상담·분쟁 조정은 아래 기관에 요청할 수 있습니다.
        </PolicyParagraph>
        <PolicyBullet>개인정보침해신고센터: 국번 없이 118</PolicyBullet>
        <PolicyBullet>개인정보분쟁조정위원회: 1833-6972</PolicyBullet>
        <PolicyBullet>대검찰청: 국번 없이 1301</PolicyBullet>
        <PolicyBullet>경찰청: 국번 없이 182</PolicyBullet>
      </PolicySection>

      <PolicySection title="10. 개인정보 처리방침의 변경">
        <PolicyParagraph>
          변경 내용과 시행일을 서비스에 공개합니다. 이용자 권리에 중요한 변경은 시행일 전에
          알립니다.
        </PolicyParagraph>
        <NavigationLink href={'/privacy/changes/2026-10-13' as Href}>
          <Pressable
            accessibilityLabel="2026년 10월 13일 개인정보처리방침 개정 안내"
            accessibilityRole="link"
            style={styles.previousPolicyLinkControl}
          >
            <Text style={[styles.previousPolicyLink, { color: theme.textSecondary }]}>
              2026년 10월 13일 개인정보처리방침 개정 안내
            </Text>
          </Pressable>
        </NavigationLink>
      </PolicySection>

      <NavigationLink href={'/privacy/2026-09-09' as Href}>
        <Pressable
          accessibilityLabel="이전 개인정보 처리방침 (2026년 9월 9일부터 2026년 10월 12일까지)"
          accessibilityRole="link"
          style={styles.previousPolicyLinkControl}
        >
          <Text style={[styles.previousPolicyLink, { color: theme.textSecondary }]}>
            이전 개인정보 처리방침 (2026년 9월 9일부터 2026년 10월 12일까지)
          </Text>
        </Pressable>
      </NavigationLink>
    </PublicPolicyDocument>
  );
}

const styles = StyleSheet.create({
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  bulletMark: { fontFamily: fontFamilies.ui, ...typography.md },
  bulletText: { flex: 1, fontFamily: fontFamilies.ui, ...typography.md },
  tableContent: { paddingBottom: spacing.xs },
  table: { borderLeftWidth: 1, borderTopWidth: 1 },
  tableRow: { flexDirection: 'row' },
  tableCell: {
    borderBottomWidth: 1,
    borderRightWidth: 1,
    flex: 1,
    fontFamily: fontFamilies.ui,
    minWidth: 160,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.sm,
  },
  tableHeaderCell: { fontWeight: '800' },
  previousPolicyLinkControl: {
    justifyContent: 'center',
    marginTop: spacing.xxxl,
    minHeight: 48,
  },
  previousPolicyLink: {
    fontFamily: fontFamilies.ui,
    textDecorationLine: 'underline',
    ...typography.sm,
  },
});
