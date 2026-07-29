import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';

const EFFECTIVE_DATE = '2026년 7월 29일';

function Section({ children, title }: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.paragraph, { color: theme.textSecondary }]}>{children}</Text>;
}

function Bullet({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletMark, { color: theme.textSecondary }]}>•</Text>
      <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{children}</Text>
    </View>
  );
}

function PolicyCard({ children, title }: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function PrivacyScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}
      testID="privacy-policy"
    >
      <Stack.Screen options={{ title: 'Kosmo 개인정보 처리방침' }} />
      <View style={styles.article}>
        <Link asChild href={'/' as Href}>
          <Pressable accessibilityRole="link">
            <Text style={[styles.backLink, { color: theme.textSecondary }]}>KOSMO로 돌아가기</Text>
          </Pressable>
        </Link>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          Kosmo 개인정보 처리방침
        </Text>
        <Text style={[styles.effectiveDate, { color: theme.textSecondary }]}>
          시행일: {EFFECTIVE_DATE}
        </Text>
        <Paragraph>
          별마루는 Kosmo 이용자의 개인정보를 중요하게 생각하며 개인정보 보호법 등 관계 법령을
          준수합니다. 이 방침은 Kosmo가 어떤 개인정보를 왜, 어떻게 처리하는지와 이용자가 행사할 수
          있는 권리를 안내합니다.
        </Paragraph>

        <Section title="1. 개인정보의 처리 목적, 항목, 법적 근거와 보유 기간">
          <PolicyCard title="서비스 제공과 계정·프로필 관리">
            <Bullet>목적: 로그인, 계정 식별, 프로필 생성·선택과 서비스 제공</Bullet>
            <Bullet>
              항목: 별마루 Account ID, Profile ID, handle, 표시명, 소개, 이미지와 선택 프로필 정보
            </Bullet>
            <Bullet>법적 근거: 개인정보 보호법 제15조 제1항 제4호(계약의 이행)</Bullet>
            <Bullet>보유: 계정 삭제 또는 처리 목적 달성 시까지</Bullet>
          </PolicyCard>
          <PolicyCard title="콘텐츠와 소셜 기능 제공">
            <Bullet>
              목적: 게시글·답글·인용, 팔로우, 반응, 북마크, 알림과 연합형 소셜 네트워크 제공
            </Bullet>
            <Bullet>
              항목: 작성 콘텐츠와 공개 범위, 관계·반응·북마크·알림 기록, 작성·변경 일시
            </Bullet>
            <Bullet>법적 근거: 개인정보 보호법 제15조 제1항 제4호(계약의 이행)</Bullet>
            <Bullet>
              보유: 계정 또는 콘텐츠 삭제, 관계 종료, 처리 목적 달성 시까지. 다른 연합 서버에 이미
              전달된 공개 정보는 해당 서버의 정책에 따라 별도로 남을 수 있습니다.
            </Bullet>
          </PolicyCard>
          <PolicyCard title="서비스 보안과 안정적인 운영">
            <Bullet>목적: 인증 유지, 오류 조사, 부정 이용 방지와 서비스 보호</Bullet>
            <Bullet>
              항목: Session ID, 접속 일시, IP 주소, 요청·오류 기록, 기기·OS·브라우저 정보
            </Bullet>
            <Bullet>
              법적 근거: 개인정보 보호법 제15조 제1항 제6호(안전한 서비스 운영을 위한 정당한 이익)
            </Bullet>
            <Bullet>보유: 보안·오류 조사 목적 달성 시까지 또는 관계 법령이 정한 기간</Bullet>
          </PolicyCard>
          <PolicyCard title="제품 이용 분석과 사용자 경험 개선">
            <Bullet>
              목적: 기능 이용 현황 파악, 사용자 흐름 개선, 품질 문제 확인과 제품 우선순위 결정
            </Bullet>
            <Bullet>
              항목: 아래 9절의 OpenPanel 자동 수집 정보, Account·Profile ID, 행동 이벤트와 session
              replay
            </Bullet>
            <Bullet>
              법적 근거: 개인정보 보호법 제15조 제1항 제6호(서비스 개선을 위한 정당한 이익).
              별마루는 원문 입력과 게시글 본문을 replay에서 가리고 10%만 표본 수집하는 등 이용자
              권리 침해를 줄입니다.
            </Bullet>
            <Bullet>
              보유: 분석 목적 달성, OpenPanel project 삭제, 계정 삭제 또는 이용자의 삭제 요청 중
              먼저 도달한 때까지. Session replay는 수집일부터 30일입니다.
            </Bullet>
          </PolicyCard>
          <PolicyCard title="문의와 권리 행사 처리">
            <Bullet>목적: 문의 답변, 개인정보 권리 행사와 분쟁 대응</Bullet>
            <Bullet>항목: 이메일 주소, 문의·요청 내용, 본인 확인 정보와 처리 결과</Bullet>
            <Bullet>
              법적 근거: 개인정보 보호법 제15조 제1항 제4호 및 제6호, 관계 법령상 의무
            </Bullet>
            <Bullet>보유: 처리 완료 후 분쟁 대응에 필요한 기간 또는 관계 법령이 정한 기간</Bullet>
          </PolicyCard>
        </Section>

        <Section title="2. 개인정보의 수집 방법">
          <Paragraph>
            별마루 ID 로그인과 Kosmo 이용 과정에서 이용자가 직접 입력하거나 서비스 동작으로 생성되는
            정보를 수집합니다. 문의를 보내는 경우 이메일을 통해 정보를 수집합니다. Web 분석 정보는
            브라우저의 OpenPanel SDK가 자동으로 수집합니다.
          </Paragraph>
        </Section>

        <Section title="3. 개인정보의 제3자 제공과 공개·연합 전송">
          <Paragraph>
            별마루는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 법령에 근거가 있거나 적법한
            절차에 따른 요청이 있는 경우에는 관계 법령에 따라 제공할 수 있습니다.
          </Paragraph>
          <Paragraph>
            이용자가 공개 또는 연합 가능한 범위로 프로필과 콘텐츠를 게시하거나 다른 연합 사용자와
            상호작용하면, 해당 공개 정보와 Account를 직접 드러내지 않는 Profile 식별자, 콘텐츠 주소,
            관계·활동 정보가 ActivityPub으로 연결된 외부 서버 운영자에게 전달될 수 있습니다. 이는
            이용자가 요청한 연합형 소셜 기능 제공을 위한 것이며, 외부 서버의 보유와 재공개에는 해당
            운영자의 정책이 적용됩니다.
          </Paragraph>
        </Section>

        <Section title="4. 개인정보 처리업무의 위탁">
          <Paragraph>원활한 서비스 제공을 위해 다음 업무를 위탁합니다.</Paragraph>
          <Bullet>Amazon Web Services, Inc.: 서비스 인프라 운영과 데이터 보관</Bullet>
          <Bullet>Oracle Corporation: 서비스 인프라 운영과 데이터 보관</Bullet>
          <Bullet>Cloudflare, Inc.: 네트워크 전송, 보안과 콘텐츠 제공</Bullet>
          <Paragraph>
            OpenPanel은 별마루가 직접 운영하는 분석 서비스이며 별도 분석 사업자에게 정보를 제공하지
            않습니다.
          </Paragraph>
        </Section>

        <Section title="5. 개인정보의 국외 이전">
          <Paragraph>
            Cloudflare의 글로벌 네트워크 이용 과정에서 접속·전송 정보가 미국 및 유럽경제지역으로
            이전될 수 있습니다. 이전받는 자는 Cloudflare, Inc. (dpo@cloudflare.com)이며, 서비스
            제공과 보안을 위해 서비스 이용 시 암호화된 네트워크로 전송됩니다. 개인정보 보호법
            제28조의8 제1항 제3호 가목에 따른 계약 이행 목적의 처리위탁으로서, 위탁계약 종료 또는
            처리 목적 달성 시까지 보유됩니다.
          </Paragraph>
          <Paragraph>
            이용자는 hello@byulmaru.co로 국외 이전 거부를 요청할 수 있습니다. 이전을 거부하면
            Kosmo의 전부 또는 일부를 이용하기 어려울 수 있습니다.
          </Paragraph>
        </Section>

        <Section title="6. 개인정보의 파기 절차와 방법">
          <Bullet>보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 파기합니다.</Bullet>
          <Bullet>
            관계 법령에 따라 보관해야 하는 정보는 다른 개인정보와 분리해 보관한 뒤 기간이 끝나면
            파기합니다.
          </Bullet>
          <Bullet>
            전자 파일과 데이터베이스 기록은 복구하기 어려운 방법으로 삭제하고, 백업은 정해진 순환
            주기에 따라 삭제합니다.
          </Bullet>
        </Section>

        <Section title="7. 이용자와 법정대리인의 권리와 행사 방법">
          <Paragraph>
            이용자와 법정대리인은 개인정보의 열람, 전송, 정정·삭제, 처리정지 또는 동의 철회를 요청할
            수 있습니다. hello@byulmaru.co로 요청하면 본인 또는 정당한 대리인인지 확인한 뒤 관계
            법령에 따라 처리합니다. 법령이 정한 사유가 있는 경우 일부 요청이 제한될 수 있으며 그
            사유를 안내합니다.
          </Paragraph>
          <Paragraph>
            OpenPanel 분석 데이터의 열람·삭제·처리정지도 같은 연락처로 요청할 수 있습니다. 별도 설정
            화면을 제공하기 전에는 브라우저의 추적 차단 기능으로 전송을 제한할 수도 있으며, 이 경우
            Kosmo의 핵심 기능은 계속 이용할 수 있습니다.
          </Paragraph>
        </Section>

        <Section title="8. 개인정보의 안전성 확보조치">
          <Paragraph>
            별마루는 접근 권한 최소화, 전송 구간 암호화, 비밀정보 분리, 접속 기록 관리, 취약점과
            권한의 정기 점검, 침해사고 대응 절차 등 개인정보의 분실·도난·유출·위조·변조·훼손을
            방지하기 위한 관리적·기술적 조치를 시행합니다.
          </Paragraph>
        </Section>

        <Section title="9. 자동 수집 정보와 행태정보">
          <PolicyCard title="OpenPanel 제품 분석">
            <Bullet>운영 주체: 별마루가 직접 운영하는 OpenPanel</Bullet>
            <Bullet>
              수집 항목: 전체 URL과 query, 페이지 title, referrer, 외부 링크 URL과 표시 텍스트,
              기기·OS·브라우저 정보, 접속 일시, 익명 device/session ID
            </Bullet>
            <Bullet>
              로그인 후 연결 정보: opaque Account ID와 이벤트 발생 시 선택 Profile ID. 이메일,
              이름과 handle은 identity trait로 보내지 않습니다.
            </Bullet>
            <Bullet>
              행동 이벤트: 로그인, Profile 생성·선택, 게시, 팔로우, 검색 제출·결과 load·다음
              페이지·결과 선택. 명시적 검색 이벤트에는 검색 원문과 선택한 Profile ID를 넣지
              않습니다.
            </Bullet>
            <Bullet>
              Session replay: 세션의 10%에서 화면 전환, 클릭, 스크롤과 렌더링 상태를 기록합니다.
              모든 input·textarea 값과 게시글 본문은 마스킹하지만 표시명, handle과 그 밖의 화면
              텍스트는 보일 수 있습니다.
            </Bullet>
            <Bullet>
              방법과 통제: Web SDK로 자동 수집하며 맞춤형 광고나 제3자 광고 제공에 사용하지
              않습니다. 브라우저 추적 차단 기능 또는 hello@byulmaru.co 요청으로 제한할 수 있습니다.
            </Bullet>
          </PolicyCard>
          <Paragraph>
            로그인 유지와 보안을 위해 cookie 또는 브라우저 저장소를 사용할 수 있습니다. 이를
            차단하거나 삭제하면 로그인 유지 등 일부 기능이 제한될 수 있습니다.
          </Paragraph>
        </Section>

        <Section title="10. 개인정보 보호책임자와 권익침해 구제">
          <Bullet>개인정보 보호책임자: 박지유</Bullet>
          <Bullet>개인정보 관련 문의와 권리 행사: hello@byulmaru.co</Bullet>
          <Paragraph>
            개인정보 침해에 관한 상담 또는 분쟁 조정은 개인정보침해신고센터(국번 없이 118),
            개인정보분쟁조정위원회(1833-6972), 대검찰청(국번 없이 1301), 경찰청(국번 없이 182)에
            요청할 수 있습니다.
          </Paragraph>
        </Section>

        <Section title="11. 개인정보 처리방침의 변경">
          <Paragraph>
            이 방침이 변경되면 변경 내용과 시행일을 Kosmo에 공개합니다. 이용자 권리에 중요한 변경은
            시행일 전에 알립니다.
          </Paragraph>
        </Section>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  article: { alignSelf: 'center', maxWidth: 840, width: '100%' },
  backLink: { fontFamily: 'SUIT', marginBottom: spacing.xl, ...typography.sm },
  title: { fontFamily: 'SUIT', fontSize: 32, fontWeight: '800', lineHeight: 40 },
  effectiveDate: {
    fontFamily: 'SUIT',
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
    ...typography.sm,
  },
  section: { gap: spacing.md, marginTop: spacing.xxxl },
  sectionTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.xl },
  paragraph: { fontFamily: 'SUIT', ...typography.md },
  card: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardTitle: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  bulletMark: { fontFamily: 'SUIT', ...typography.md },
  bulletText: { flex: 1, fontFamily: 'SUIT', ...typography.md },
});
