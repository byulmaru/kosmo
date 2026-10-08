import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import type { PropsWithChildren, ReactNode } from 'react';

const EFFECTIVE_DATE = '2026년 10월 8일';
const POLICY_TITLE = 'Kosmo 개인정보 처리방침';

function SubsectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.subsectionTitle, { color: theme.text }]}>
      {children}
    </Text>
  );
}

function PolicyTable({
  children,
  headers,
  minWidth,
}: PropsWithChildren<{ headers: readonly string[]; minWidth: number }>) {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.tableContent} horizontal tabIndex={0}>
      <View style={[styles.table, { borderColor: theme.border, minWidth }]}>
        <TableRow cells={headers} header />
        {children}
      </View>
    </ScrollView>
  );
}

function TableRow({ cells, header = false }: { cells: readonly string[]; header?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.tableRow, { backgroundColor: header ? theme.surface : theme.background }]}>
      {cells.map((cell, index) => (
        <Text
          accessibilityRole={header ? 'header' : undefined}
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
      <PolicyParagraph>
        별마루는 Kosmo 이용자의 개인정보를 중요하게 생각하며 개인정보 보호법 등 관계 법령을
        준수합니다. 이 방침은 Kosmo가 어떤 개인정보를 왜, 어떻게 처리하는지와 이용자가 행사할 수
        있는 권리를 안내합니다.
      </PolicyParagraph>

      <PolicySection title="1. 개인정보 처리 목적·항목·보유기간 및 근거">
        <SubsectionTitle>동의를 받아 처리하는 개인정보</SubsectionTitle>
        <PolicyParagraph>별도의 동의를 받아 처리하는 항목은 없습니다.</PolicyParagraph>
        <SubsectionTitle>동의 없이 처리하는 개인정보</SubsectionTitle>
        <PolicyTable
          headers={['처리 항목', '처리 목적', '보유 기간', '개인정보 처리의 법적 근거']}
          minWidth={900}
        >
          <TableRow
            cells={[
              '별마루 Account ID, Profile ID, handle, 표시명, 소개, 이미지와 선택 프로필 정보',
              '로그인, 계정 식별, 프로필 생성·선택과 서비스 제공',
              'Account 정보의 처리 시점과 탈퇴 절차는 계정 삭제 안내를 따릅니다. Profile 정보는 계정 탈퇴 처리 완료일부터 30일간 보관한 뒤 파기합니다.',
              '개인정보 보호법 제15조 제1항 제4호(계약의 이행)',
            ]}
          />
          <TableRow
            cells={[
              '작성 콘텐츠와 공개 범위, 관계·반응·북마크·알림 기록, 작성·변경 일시',
              '게시글·답글·인용, 팔로우, 반응, 북마크, 알림과 연합형 소셜 네트워크 제공',
              '콘텐츠 삭제, 관계 종료 또는 처리 목적 달성 시까지. 계정 탈퇴 처리 완료일부터 관련 게시글과 관계 기록을 30일간 보관한 뒤 파기합니다. 다른 연합 서버에 이미 전달된 공개 정보는 해당 서버의 정책에 따라 별도로 남을 수 있습니다. 계정 삭제 요청에 따른 비공개 전환은 계정 삭제 안내를 따릅니다.',
              '개인정보 보호법 제15조 제1항 제4호(계약의 이행)',
            ]}
          />
          <TableRow
            cells={[
              'Session ID, 접속 일시, IP 주소, 요청·오류 기록, 기기·OS·브라우저 정보',
              '인증 유지, 오류 조사, 부정 이용 방지와 서비스 보호',
              '계정 이용 중 보안·오류 조사 목적에 필요한 기간 보관하고, 계정 탈퇴 처리 완료일부터 30일간 보관한 뒤 파기합니다.',
              '개인정보 보호법 제15조 제1항 제6호(안전한 서비스 운영을 위한 정당한 이익)',
            ]}
          />
          <TableRow
            cells={[
              '아래 7절의 이용 정보, 로그인한 경우 계정·프로필 식별자',
              '기능 이용 현황 파악, 사용자 흐름 개선, 품질 문제 확인과 제품 우선순위 결정',
              '일반 이벤트는 수집일부터 12개월간 보유하며, 보유 기간이 지나면 지체 없이 파기합니다.',
              '개인정보 보호법 제15조 제1항 제6호(서비스 개선을 위한 정당한 이익)',
            ]}
          />
          <TableRow
            cells={[
              '이메일 주소, 문의·요청 내용, 본인 확인 정보와 처리 결과',
              '문의 답변, 개인정보 권리 행사와 분쟁 대응',
              '처리 완료 후 분쟁 대응에 필요한 기간 또는 관계 법령이 정한 기간',
              '개인정보 보호법 제15조 제1항 제4호 및 제6호, 관계 법령상 의무',
            ]}
          />
        </PolicyTable>
        <PolicyParagraph>
          별마루 ID 로그인과 Kosmo 이용 과정에서 이용자가 직접 입력하거나 서비스 동작으로 생성되는
          정보를 수집합니다. 문의를 보내는 경우 이메일을 통해 정보를 수집합니다. Web 분석 정보는
          PostHog가 자동으로 수집합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="2. 개인정보의 제3자 제공">
        <PolicyParagraph>
          별마루는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 이용자가 공개 또는
          연합 가능한 범위로 프로필과 콘텐츠를 게시하거나 다른 연합 사용자와 상호작용하면, 다음
          범위에서 ActivityPub으로 연결된 외부 서버 운영자에게 전달될 수 있습니다.
        </PolicyParagraph>
        <PolicyTable
          headers={['제공받는 자', '제공 목적', '제공 항목', '보유 기간']}
          minWidth={860}
        >
          <TableRow
            cells={[
              'ActivityPub으로 연결된 외부 서버 운영자',
              '이용자가 요청한 연합형 소셜 기능 제공',
              '공개 정보와 Account를 직접 드러내지 않는 Profile 식별자, 콘텐츠 주소, 관계·활동 정보',
              '외부 서버 운영자의 정책에 따릅니다.',
            ]}
          />
        </PolicyTable>
        <PolicyParagraph>
          외부 서버의 보유와 재공개에는 해당 운영자의 정책이 적용됩니다.
        </PolicyParagraph>
        <PolicyParagraph>
          법령에 근거가 있거나 적법한 절차에 따른 요청이 있는 경우에는 관계 법령에 따라 개인정보를
          제공할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="3. 개인정보 처리 업무의 위탁">
        <PolicyParagraph>
          별마루는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁합니다.
        </PolicyParagraph>
        <PolicyTable headers={['수탁자', '위탁 업무']} minWidth={640}>
          <TableRow cells={['Amazon Web Services, Inc.', '서비스 인프라 운영과 데이터 보관']} />
          <TableRow cells={['Oracle Corporation', '서비스 인프라 운영과 데이터 보관']} />
          <TableRow cells={['Cloudflare, Inc.', '네트워크 전송, 보안과 콘텐츠 제공']} />
          <TableRow cells={['PostHog, Inc.', '제품 이용 분석 서비스']} />
        </PolicyTable>
        <PolicyParagraph>
          PostHog Cloud에서 수집되는 제품 분석 정보는 7절에 설명합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="4. 개인정보의 국외 이전">
        <PolicyParagraph>
          별마루는 서비스 제공을 위해 다음과 같이 개인정보를 국외로 이전합니다. Cloudflare의 글로벌
          네트워크 이용 과정에서 접속·전송 정보가 미국 및 유럽경제지역으로 이전될 수 있습니다.
          Cloudflare에 대한 국외 이전은 개인정보 보호법 제28조의8 제1항 제3호 가목에 따른 계약 이행
          목적의 처리위탁으로 처리합니다. EU 리전 전환 이후 PostHog Cloud로 새로 수집하는 정보의
          국외 이전은 개인정보 보호법 제28조의8 제1항 제5호에 따라 개인정보보호위원회가 동등한
          개인정보 보호 수준을 인정한 유럽연합으로의 이전으로 처리합니다.
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
        >
          <TableRow
            cells={[
              'Cloudflare, Inc.\ndpo@cloudflare.com',
              '미국 및 유럽경제지역',
              '접속·전송 정보의 서비스 제공과 보안',
              '서비스 이용 시 암호화된 네트워크로 전송',
              '위탁계약 종료 또는 처리 목적 달성 시까지',
            ]}
          />
          <TableRow
            cells={[
              'PostHog, Inc.\nprivacy@posthog.com',
              '독일(프랑크푸르트)',
              '7절의 제품 분석 정보, 제품 이용 분석 목적',
              '서비스 이용 시 암호화된 네트워크로 지속적으로 전송',
              '일반 이벤트는 수집일부터 12개월간 보유하며, 보유 기간이 지나면 지체 없이 파기합니다.',
            ]}
          />
        </PolicyTable>
        <PolicyParagraph>
          이용자는 hello@byulmaru.co로 국외 이전의 거부 또는 제한을 요청할 수 있습니다. Cloudflare
          국외 이전을 거부하면 네트워크·보안·콘텐츠 제공이 제한되어 Kosmo의 전부 또는 일부를
          이용하기 어려울 수 있습니다. PostHog 관련 이전은 같은 연락처로 거부 또는 제한을 요청할 수
          있고, 브라우저 추적 방지 기능으로 분석 정보 전송을 제한할 수도 있습니다. 요청 시 본인 확인
          후 PostHog 제품 분석 정보 전송을 제한하고 처리 결과를 안내합니다. PostHog 거부·제한 시
          제품 이용 분석만 제한되며, Kosmo의 핵심 기능 이용에는 영향을 주지 않습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="5. 개인정보의 파기">
        <NumberedItem number={1}>
          보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 파기합니다. 다만 진행 중인 신고·분쟁
          또는 수사기관 요청의 처리에 필요한 관련 기록만 예외적으로 필요성이 있는 동안 보관하고,
          필요성이 끝나면 지체 없이 파기합니다.
        </NumberedItem>
        <NumberedItem number={2}>
          관계 법령에 따라 보관해야 하는 정보는 다른 개인정보와 분리해 보관한 뒤 기간이 끝나면
          파기합니다.
        </NumberedItem>
        <NumberedItem number={3}>
          전자 파일과 데이터베이스 기록은 복구하기 어려운 방법으로 삭제하고, 백업은 정해진 순환
          주기에 따라 삭제합니다.
        </NumberedItem>
      </PolicySection>

      <PolicySection title="6. 이용자와 법정대리인의 권리">
        <PolicyParagraph>
          이용자와 법정대리인은 개인정보의 열람, 전송, 정정·삭제, 처리정지 또는 동의 철회를 요청할
          수 있습니다. Kosmo 계정 탈퇴는 탈퇴하려는 Kosmo 계정으로 로그인한 뒤 Kosmo 내 설정에서
          신청해 주세요. 그 밖의 권리 행사 요청은 아래 연락처로 접수할 수 있으며, 본인 또는 정당한
          대리인인지 확인한 뒤 관계 법령에 따라 처리합니다. 법령이 정한 사유가 있는 경우 일부 요청이
          제한될 수 있으며 그 사유를 안내합니다.
        </PolicyParagraph>
        <PolicyEmailLink />
        <PolicyBullet>계정 정보의 열람·정정과 처리정지</PolicyBullet>
        <PolicyBullet>그 밖의 개인정보 관련 요청</PolicyBullet>
        <PolicyParagraph>
          PostHog 분석 데이터의 열람·삭제·처리정지도 같은 연락처로 요청할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="7. 자동으로 저장되는 정보">
        <PolicyParagraph>
          별마루는 로그인 유지, 이용 편의와 서비스의 안전한 운영을 위해 이용자의 브라우저에 정보를
          저장할 수 있습니다. 로그인 유지와 보안을 위한 cookie 또는 브라우저 저장소를 차단하거나
          삭제하면 로그인 유지 등 일부 기능이 제한될 수 있습니다. PostHog 분석 식별자는 cookie 또는
          localStorage에 저장될 수 있습니다. 브라우저 추적 차단 기능이나 해당 저장을 제한하면 분석
          정보 전송이 제한될 수 있으며, Kosmo의 핵심 기능은 계속 이용할 수 있습니다.
        </PolicyParagraph>
        <SubsectionTitle>PostHog 제품 분석</SubsectionTitle>
        <PolicyTable headers={['구분', '내용']} minWidth={720}>
          <TableRow cells={['운영 주체', 'PostHog, Inc.가 제공하는 PostHog Cloud']} />
          <TableRow
            cells={[
              '수집 항목',
              '방문한 페이지 주소와 유입 경로, 검색어가 포함될 수 있는 URL, 클릭·스크롤 등 서비스 이용 기록, 기기·운영체제·브라우저 정보, 접속 일시, 분석용 식별자',
            ]}
          />
          <TableRow
            cells={[
              '로그인 연결',
              '로그인한 경우 계정·프로필 식별자와 서비스 이용 기록을 연결합니다.',
            ]}
          />
          <TableRow
            cells={[
              '이용 목적',
              '서비스 이용을 분석하고 제품을 개선하는 데 사용하며, 맞춤형 광고에는 사용하지 않습니다.',
            ]}
          />
        </PolicyTable>
      </PolicySection>

      <PolicySection title="8. 개인정보의 안전성 확보">
        <PolicyParagraph>
          별마루는 접근 권한 최소화, 전송 구간 암호화, 비밀정보 분리, 접속 기록 관리, 취약점과
          권한의 정기 점검, 침해사고 대응 절차 등 개인정보의 분실·도난·유출·위조·변조·훼손을
          방지하기 위한 관리적·기술적 조치를 시행합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="9. 개인정보 보호책임자와 문의">
        <PolicyBullet>개인정보 보호책임자: 박지유</PolicyBullet>
        <PolicyEmailLink />
        <PolicyParagraph>
          개인정보 처리와 관련한 문의, 불만 또는 권리 행사 요청은 위 연락처로 접수할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="10. 권익침해 구제 방법">
        <PolicyParagraph>
          이용자는 개인정보 침해에 대한 상담이나 분쟁 조정을 위해 다음 기관에 도움을 요청할 수
          있습니다.
        </PolicyParagraph>
        <PolicyBullet>개인정보침해신고센터: 국번 없이 118</PolicyBullet>
        <PolicyBullet>개인정보분쟁조정위원회: 1833-6972</PolicyBullet>
        <PolicyBullet>대검찰청: 국번 없이 1301</PolicyBullet>
        <PolicyBullet>경찰청: 국번 없이 182</PolicyBullet>
      </PolicySection>

      <PolicySection title="11. 개인정보 처리방침의 변경">
        <PolicyParagraph>
          본 방침이 변경되는 경우 변경 내용과 시행일을 서비스에 공개합니다. 이용자 권리에 중요한
          변경은 시행일 전에 알립니다.
        </PolicyParagraph>
      </PolicySection>

      <NavigationLink href={'/privacy/2026-09-09' as Href}>
        <Pressable
          accessibilityLabel="이전 개인정보 처리방침 (2026년 9월 9일부터 2026년 10월 7일까지)"
          accessibilityRole="link"
          style={styles.previousPolicyLinkControl}
        >
          <Text style={[styles.previousPolicyLink, { color: theme.textSecondary }]}>
            이전 개인정보 처리방침 (2026년 9월 9일부터 2026년 10월 7일까지)
          </Text>
        </Pressable>
      </NavigationLink>
    </PublicPolicyDocument>
  );
}

const styles = StyleSheet.create({
  subsectionTitle: {
    fontFamily: fontFamilies.ui,
    fontWeight: '800',
    ...typography.md,
  },
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
