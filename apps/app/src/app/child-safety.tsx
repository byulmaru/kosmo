import {
  PolicyBullet,
  PolicyEmailLink,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';

const EFFECTIVE_DATE = '2026년 9월 9일';
const POLICY_TITLE = 'Kosmo 아동 안전 정책';

export default function ChildSafetyScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="child-safety"
      effectiveDate={EFFECTIVE_DATE}
      testID="child-safety-policy"
      title={POLICY_TITLE}
    >
      <PolicySection title="우리의 원칙">
        <PolicyParagraph>
          Byulmaru가 운영하는 Kosmo는 아동의 안전을 최우선으로 합니다. 아동 성적 학대·착취(CSAE)
          또는 아동 성적 학대·착취 이미지·영상(CSAM)을 제작, 요청, 저장, 게시, 공유하거나 이를 돕는
          행위를 허용하지 않습니다. 아동을 성적으로 대상화하거나 위험에 빠뜨리는 행위, 그 밖에
          아동의 안전을 위협하는 행위도 허용하지 않습니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="의심되는 콘텐츠나 행동을 발견한 경우">
        <PolicyParagraph>
          의심되는 콘텐츠 또는 행동을 확인했다면 hello@byulmaru.co로 신고해 주세요. 가능한 경우 다음
          정보를 함께 알려 주세요.
        </PolicyParagraph>
        <PolicyBullet>콘텐츠 또는 계정의 URL이나 사용자 핸들</PolicyBullet>
        <PolicyBullet>발견한 날짜와 시간(시간대 포함)</PolicyBullet>
        <PolicyBullet>
          어떤 콘텐츠·행동이 아동 안전을 위협한다고 판단했는지에 대한 설명
        </PolicyBullet>
        <PolicyParagraph>
          CSAE/CSAM 이미지나 영상을 이메일에 첨부하거나 다시 보내지 마세요. 신고 처리에 필요한
          범위에서만 관련 정보를 확인하고, 신고 내용은 아동 안전 대응 목적으로 검토합니다.
        </PolicyParagraph>
        <PolicyParagraph>
          신고가 접수되면 관련 계정과 콘텐츠를 검토합니다. 위반이 확인되면 콘텐츠 제거와 관련 계정
          제한 등 필요한 보호 조치를 시행합니다. 신고자에게 모든 검토 결과를 공개하지 못할 수
          있습니다.
        </PolicyParagraph>
        <PolicyParagraph>
          아동 성적 학대·착취 행위가 의심되는 경우 적용되는 아동 안전 관련 법률을 준수하며, 관계
          기관 신고 등 법률상 필요한 조치를 이행합니다.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection title="문의와 신고">
        <PolicyParagraph>
          이 정책에 관한 문의와 아동 안전 신고는 다음 주소로 보내 주세요. 신고를 보낼 때에는 유해한
          이미지나 영상을 첨부하지 말고, 확인에 필요한 링크와 설명만 적어 주세요.
        </PolicyParagraph>
        <PolicyEmailLink />
      </PolicySection>
    </PublicPolicyDocument>
  );
}
