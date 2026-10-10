import {
  PolicyEmailLink,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';

const EFFECTIVE_DATE = '2026년 10월 8일';
const POLICY_TITLE = 'Kosmo 계정 삭제 안내';

export default function AccountDeletionScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="account-deletion"
      effectiveDate={EFFECTIVE_DATE}
      testID="account-deletion-policy"
      title={POLICY_TITLE}
    >
      <PolicySection title="계정 탈퇴 신청">
        <PolicyParagraph>
          탈퇴하려는 Kosmo 계정으로 로그인한 뒤 Kosmo 내 설정에서 계정 탈퇴를 신청해 주세요.
        </PolicyParagraph>
        <PolicyParagraph>
          계정 탈퇴 안내에 관한 질문은 아래 연락처로 문의해 주세요. Kosmo 내 설정에서 탈퇴를 신청할
          수 없는 경우 아래 이메일로 계정 탈퇴를 요청할 수 있으며, 이메일 요청은 계정 소유자 확인 후
          처리합니다.
        </PolicyParagraph>
        <PolicyEmailLink />
      </PolicySection>

      <PolicySection title="처리 범위와 삭제 시점">
        <PolicyParagraph>
          탈퇴 처리가 완료되어 계정 이용이 종료되면 Kosmo에 저장된 관련 계정·프로필, 게시글·답글,
          업로드한 이미지 등을 비공개로 전환합니다. Byulmaru ID 계정은 유지됩니다.
        </PolicyParagraph>
        <PolicyParagraph>
          관련 정보는 계정 탈퇴 처리 완료일부터 30일간 보관한 뒤 파기합니다. 이미 다른 연합 서버에
          전달된 공개 정보는 해당 서버 운영자의 정책에 따라 별도로 보관되거나 재공개될 수 있습니다.
        </PolicyParagraph>
        <PolicyParagraph>
          다만 진행 중인 신고·분쟁 또는 수사기관 요청의 처리에 필요한 관련 기록만 예외적으로
          필요성이 있는 동안 보관하고, 필요성이 끝나면 지체 없이 파기합니다.
        </PolicyParagraph>
        <PolicyParagraph>
          법령에 따라 보존해야 하는 정보는 해당 법령에서 정한 기간 동안 보관한 뒤 파기합니다.
        </PolicyParagraph>
      </PolicySection>
    </PublicPolicyDocument>
  );
}
