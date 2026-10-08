import {
  PolicyBullet,
  PolicyEmailLink,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';

const EFFECTIVE_DATE = '2026년 9월 9일';
const POLICY_TITLE = 'Kosmo 계정 삭제 안내';

export default function AccountDeletionScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="account-deletion"
      effectiveDate={EFFECTIVE_DATE}
      testID="account-deletion-policy"
      title={POLICY_TITLE}
    >
      <PolicySection title="계정 삭제 요청">
        <PolicyParagraph>
          Kosmo 계정 삭제를 요청하려면 다음 주소로 이메일을 보내 주세요. 이메일을 확인한 담당자가
          본인 확인에 필요한 최소 절차를 안내하고 처리합니다.
        </PolicyParagraph>
        <PolicyEmailLink />
        <PolicyBullet>제목: [Kosmo] 계정 삭제 요청</PolicyBullet>
        <PolicyBullet>
          본문: 본인 확인을 위한 최소 정보로 Kosmo 프로필 주소 또는 @handle만 적어 주세요.
        </PolicyBullet>
        <PolicyBullet>
          비밀번호, 일회용 비밀번호(OTP), 신분증 사본이나 기타 인증 비밀값은 보내지 마세요.
        </PolicyBullet>
      </PolicySection>

      <PolicySection title="처리 범위와 삭제 시점">
        <PolicyParagraph>
          본인 확인이 완료되면 Kosmo 계정·프로필, 게시글·답글, 업로드한 이미지 등 Kosmo에 저장된
          관련 데이터만 삭제 대상으로 처리합니다. Byulmaru ID 계정은 유지됩니다.
        </PolicyParagraph>
        <PolicyParagraph>
          본인 확인이 완료된 시점부터 관련 콘텐츠는 즉시 비공개로 전환하며, 신고 검토와 안전한
          서비스 운영을 위한 기본 보관기간은 최대 30일입니다. 신고가 있는 경우 신고와 관련된
          콘텐츠·증거만 처리 완료 시까지 보관기간이 연장될 수 있고, 신고와 무관한 데이터는 기본
          보관기간 종료 후 삭제합니다.
        </PolicyParagraph>
        <PolicyParagraph>
          기본 30일과 관련 신고 처리가 모두 끝난 뒤 별도 법적 보존 사유가 없다면 삭제합니다.
        </PolicyParagraph>
      </PolicySection>
    </PublicPolicyDocument>
  );
}
