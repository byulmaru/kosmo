import {
  PolicyBullet,
  PolicyCard,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';

const EFFECTIVE_DATE = '2026년 9월 9일';
const POLICY_TITLE = 'Kosmo 개인정보 처리방침';

export default function PrivacyScreen() {
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

      <PolicySection title="1. 개인정보의 처리 목적, 항목, 법적 근거와 보유 기간">
        <PolicyCard title="서비스 제공과 계정·프로필 관리">
          <PolicyBullet>목적: 로그인, 계정 식별, 프로필 생성·선택과 서비스 제공</PolicyBullet>
          <PolicyBullet>
            항목: 별마루 Account ID, Profile ID, handle, 표시명, 소개, 이미지와 선택 프로필 정보
          </PolicyBullet>
          <PolicyBullet>법적 근거: 개인정보 보호법 제15조 제1항 제4호(계약의 이행)</PolicyBullet>
          <PolicyBullet>
            보유: 계정 삭제 또는 처리 목적 달성 시까지. 계정 삭제 요청과 처리 시점은 계정 삭제
            안내를 따릅니다.
          </PolicyBullet>
        </PolicyCard>
        <PolicyCard title="콘텐츠와 소셜 기능 제공">
          <PolicyBullet>
            목적: 게시글·답글·인용, 팔로우, 반응, 북마크, 알림과 연합형 소셜 네트워크 제공
          </PolicyBullet>
          <PolicyBullet>
            항목: 작성 콘텐츠와 공개 범위, 관계·반응·북마크·알림 기록, 작성·변경 일시
          </PolicyBullet>
          <PolicyBullet>법적 근거: 개인정보 보호법 제15조 제1항 제4호(계약의 이행)</PolicyBullet>
          <PolicyBullet>
            보유: 계정 또는 콘텐츠 삭제, 관계 종료, 처리 목적 달성 시까지. 다른 연합 서버에 이미
            전달된 공개 정보는 해당 서버의 정책에 따라 별도로 남을 수 있습니다. 계정 삭제 요청에
            따른 비공개 전환과 보존 예외는 계정 삭제 안내를 따릅니다.
          </PolicyBullet>
        </PolicyCard>
        <PolicyCard title="서비스 보안과 안정적인 운영">
          <PolicyBullet>목적: 인증 유지, 오류 조사, 부정 이용 방지와 서비스 보호</PolicyBullet>
          <PolicyBullet>
            항목: Session ID, 접속 일시, IP 주소, 요청·오류 기록, 기기·OS·브라우저 정보
          </PolicyBullet>
          <PolicyBullet>
            법적 근거: 개인정보 보호법 제15조 제1항 제6호(안전한 서비스 운영을 위한 정당한 이익)
          </PolicyBullet>
          <PolicyBullet>
            보유: 보안·오류 조사 목적 달성 시까지 또는 관계 법령이 정한 기간
          </PolicyBullet>
        </PolicyCard>
        <PolicyCard title="제품 이용 분석과 사용자 경험 개선">
          <PolicyBullet>
            목적: 기능 이용 현황 파악, 사용자 흐름 개선, 품질 문제 확인과 제품 우선순위 결정
          </PolicyBullet>
          <PolicyBullet>
            항목: 아래 9절의 OpenPanel 자동 수집 정보, Account·Profile ID, 행동 이벤트와 session
            replay
          </PolicyBullet>
          <PolicyBullet>
            법적 근거: 개인정보 보호법 제15조 제1항 제6호(서비스 개선을 위한 정당한 이익). 별마루는
            원문 입력과 게시글 본문을 replay에서 가리고 10%만 표본 수집하는 등 이용자 권리 침해를
            줄입니다.
          </PolicyBullet>
          <PolicyBullet>
            보유: 분석 목적 달성, OpenPanel project 삭제, 계정 삭제 또는 이용자의 삭제 요청 중 먼저
            도달한 때까지. Session replay는 수집일부터 30일입니다.
          </PolicyBullet>
        </PolicyCard>
        <PolicyCard title="문의와 권리 행사 처리">
          <PolicyBullet>목적: 문의 답변, 개인정보 권리 행사와 분쟁 대응</PolicyBullet>
          <PolicyBullet>항목: 이메일 주소, 문의·요청 내용, 본인 확인 정보와 처리 결과</PolicyBullet>
          <PolicyBullet>
            법적 근거: 개인정보 보호법 제15조 제1항 제4호 및 제6호, 관계 법령상 의무
          </PolicyBullet>
          <PolicyBullet>
            보유: 처리 완료 후 분쟁 대응에 필요한 기간 또는 관계 법령이 정한 기간
          </PolicyBullet>
        </PolicyCard>
      </PolicySection>

      <PolicySection title="2. 개인정보의 수집 방법">
        <PolicyParagraph>
          별마루 ID 로그인과 Kosmo 이용 과정에서 이용자가 직접 입력하거나 서비스 동작으로 생성되는
          정보를 수집합니다. 문의를 보내는 경우 이메일을 통해 정보를 수집합니다. Web 분석 정보는
          브라우저의 OpenPanel SDK가 자동으로 수집합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="3. 개인정보의 제3자 제공과 공개·연합 전송">
        <PolicyParagraph>
          별마루는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다. 법령에 근거가 있거나 적법한
          절차에 따른 요청이 있는 경우에는 관계 법령에 따라 제공할 수 있습니다.
        </PolicyParagraph>
        <PolicyParagraph>
          이용자가 공개 또는 연합 가능한 범위로 프로필과 콘텐츠를 게시하거나 다른 연합 사용자와
          상호작용하면, 해당 공개 정보와 Account를 직접 드러내지 않는 Profile 식별자, 콘텐츠 주소,
          관계·활동 정보가 ActivityPub으로 연결된 외부 서버 운영자에게 전달될 수 있습니다. 이는
          이용자가 요청한 연합형 소셜 기능 제공을 위한 것이며, 외부 서버의 보유와 재공개에는 해당
          운영자의 정책이 적용됩니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="4. 개인정보 처리업무의 위탁">
        <PolicyParagraph>원활한 서비스 제공을 위해 다음 업무를 위탁합니다.</PolicyParagraph>
        <PolicyBullet>Amazon Web Services, Inc.: 서비스 인프라 운영과 데이터 보관</PolicyBullet>
        <PolicyBullet>Oracle Corporation: 서비스 인프라 운영과 데이터 보관</PolicyBullet>
        <PolicyBullet>Cloudflare, Inc.: 네트워크 전송, 보안과 콘텐츠 제공</PolicyBullet>
        <PolicyParagraph>
          OpenPanel은 별마루가 직접 운영하는 분석 서비스이며 별도 분석 사업자에게 정보를 제공하지
          않습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="5. 개인정보의 국외 이전">
        <PolicyParagraph>
          Cloudflare의 글로벌 네트워크 이용 과정에서 접속·전송 정보가 미국 및 유럽경제지역으로
          이전될 수 있습니다. 이전받는 자는 Cloudflare, Inc. (dpo@cloudflare.com)이며, 서비스 제공과
          보안을 위해 서비스 이용 시 암호화된 네트워크로 전송됩니다. 개인정보 보호법 제28조의8 제1항
          제3호 가목에 따른 계약 이행 목적의 처리위탁으로서, 위탁계약 종료 또는 처리 목적 달성
          시까지 보유됩니다.
        </PolicyParagraph>
        <PolicyParagraph>
          이용자는 hello@byulmaru.co로 국외 이전 거부를 요청할 수 있습니다. 이전을 거부하면 Kosmo의
          전부 또는 일부를 이용하기 어려울 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="6. 개인정보의 파기 절차와 방법">
        <PolicyBullet>
          보유 기간이 지나거나 처리 목적이 달성되면 지체 없이 파기합니다. 계정 삭제 안내에서 정한
          moderation 및 신고 처리 관련 보존 예외가 적용될 수 있습니다.
        </PolicyBullet>
        <PolicyBullet>
          관계 법령에 따라 보관해야 하는 정보는 다른 개인정보와 분리해 보관한 뒤 기간이 끝나면
          파기합니다.
        </PolicyBullet>
        <PolicyBullet>
          전자 파일과 데이터베이스 기록은 복구하기 어려운 방법으로 삭제하고, 백업은 정해진 순환
          주기에 따라 삭제합니다.
        </PolicyBullet>
      </PolicySection>

      <PolicySection title="7. 이용자와 법정대리인의 권리와 행사 방법">
        <PolicyParagraph>
          이용자와 법정대리인은 개인정보의 열람, 전송, 정정·삭제, 처리정지 또는 동의 철회를 요청할
          수 있습니다. hello@byulmaru.co로 요청하면 본인 또는 정당한 대리인인지 확인한 뒤 관계
          법령에 따라 처리합니다. 법령이 정한 사유가 있는 경우 일부 요청이 제한될 수 있으며 그
          사유를 안내합니다.
        </PolicyParagraph>
        <PolicyParagraph>
          OpenPanel 분석 데이터의 열람·삭제·처리정지도 같은 연락처로 요청할 수 있습니다. 별도 설정
          화면을 제공하기 전에는 브라우저의 추적 차단 기능으로 전송을 제한할 수도 있으며, 이 경우
          Kosmo의 핵심 기능은 계속 이용할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="8. 개인정보의 안전성 확보조치">
        <PolicyParagraph>
          별마루는 접근 권한 최소화, 전송 구간 암호화, 비밀정보 분리, 접속 기록 관리, 취약점과
          권한의 정기 점검, 침해사고 대응 절차 등 개인정보의 분실·도난·유출·위조·변조·훼손을
          방지하기 위한 관리적·기술적 조치를 시행합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="9. 자동 수집 정보와 행태정보">
        <PolicyCard title="OpenPanel 제품 분석">
          <PolicyBullet>운영 주체: 별마루가 직접 운영하는 OpenPanel</PolicyBullet>
          <PolicyBullet>
            수집 항목: 전체 URL과 query, 페이지 title, referrer, 외부 링크 URL과 표시 텍스트,
            기기·OS·브라우저 정보, 접속 일시, 익명 device/session ID
          </PolicyBullet>
          <PolicyBullet>
            로그인 후 연결 정보: opaque Account ID와 이벤트 발생 시 선택 Profile ID. 이메일, 이름과
            handle은 identity trait로 보내지 않습니다.
          </PolicyBullet>
          <PolicyBullet>
            행동 이벤트: Profile 생성·선택, 게시, 팔로우, 검색 제출·결과 load·결과 선택. 명시적 검색
            이벤트에는 검색 원문과 선택한 Profile ID를 넣지 않습니다.
          </PolicyBullet>
          <PolicyBullet>
            Session replay: 세션의 10%에서 화면 전환, 클릭, 스크롤과 렌더링 상태를 기록합니다. 모든
            input·textarea 값은 마스킹하고 게시글 본문 영역은 기록에서 제외하지만 표시명, handle과
            그 밖의 화면 텍스트는 보일 수 있습니다.
          </PolicyBullet>
          <PolicyBullet>
            방법과 통제: Web SDK로 자동 수집하며 맞춤형 광고나 제3자 광고 제공에 사용하지 않습니다.
            브라우저 추적 차단 기능 또는 hello@byulmaru.co 요청으로 제한할 수 있습니다.
          </PolicyBullet>
        </PolicyCard>
        <PolicyParagraph>
          로그인 유지와 보안을 위해 cookie 또는 브라우저 저장소를 사용할 수 있습니다. 이를
          차단하거나 삭제하면 로그인 유지 등 일부 기능이 제한될 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="10. 개인정보 보호책임자와 권익침해 구제">
        <PolicyBullet>개인정보 보호책임자: 박지유</PolicyBullet>
        <PolicyBullet>개인정보 관련 문의와 권리 행사: hello@byulmaru.co</PolicyBullet>
        <PolicyParagraph>
          개인정보 침해에 관한 상담 또는 분쟁 조정은 개인정보침해신고센터(국번 없이 118),
          개인정보분쟁조정위원회(1833-6972), 대검찰청(국번 없이 1301), 경찰청(국번 없이 182)에
          요청할 수 있습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="11. 개인정보 처리방침의 변경">
        <PolicyParagraph>
          이 방침이 변경되면 변경 내용과 시행일을 Kosmo에 공개합니다. 이용자 권리에 중요한 변경은
          시행일 전에 알립니다.
        </PolicyParagraph>
      </PolicySection>
    </PublicPolicyDocument>
  );
}
