import {
  PolicyBullet,
  PolicyParagraph,
  PolicySection,
  PublicPolicyDocument,
} from '@/components/public-policy/PublicPolicyDocument';

const EFFECTIVE_DATE = '2026년 9월 16일';
const POLICY_TITLE = 'Kosmo 계정 삭제 안내';

export default function AccountDeletionScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="account-deletion"
      effectiveDate={EFFECTIVE_DATE}
      testID="account-deletion-policy"
      title={POLICY_TITLE}
    >
      <PolicySection title="계정 삭제 방법">
        <PolicyParagraph>
          Kosmo 계정 삭제는 Kosmo에 로그인한 상태에서 설정의 코스모 탈퇴 메뉴를 통해 직접 진행할 수
          있습니다. 메뉴를 선택한 뒤 화면의 안내에 따라 탈퇴를 완료해 주세요.
        </PolicyParagraph>
        <PolicyBullet>탈퇴 메뉴는 설정에 항상 표시됩니다.</PolicyBullet>
        <PolicyBullet>
          연결된 모든 Kosmo 프로필이 비활성화된 경우에만 계정 삭제를 완료할 수 있습니다.
        </PolicyBullet>
        <PolicyBullet>활성 프로필이 남아 있으면 프로필을 먼저 비활성화해야 합니다.</PolicyBullet>
      </PolicySection>

      <PolicySection title="탈퇴 후 처리">
        <PolicyParagraph>
          탈퇴가 완료되면 Kosmo 계정은 삭제된 상태로 남고 모든 로그인 세션과 기기 연결이 해제됩니다.
          Byulmaru ID 계정은 유지됩니다.
        </PolicyParagraph>
        <PolicyParagraph>
          탈퇴에는 유예기간이 없으며, 완료 후 같은 Byulmaru ID로 Kosmo에 다시 가입할 수 없습니다. 이
          재가입 제한은 임시 조치입니다.
        </PolicyParagraph>
      </PolicySection>
    </PublicPolicyDocument>
  );
}
