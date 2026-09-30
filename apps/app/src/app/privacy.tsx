import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_TITLE,
  PrivacyPolicyContent,
} from '@/components/public-policy/PrivacyPolicyContent';
import { PublicPolicyDocument } from '@/components/public-policy/PublicPolicyDocument';

export default function PrivacyScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="privacy"
      effectiveDate={PRIVACY_POLICY_EFFECTIVE_DATE}
      testID="privacy-policy"
      title={PRIVACY_POLICY_TITLE}
    >
      <PrivacyPolicyContent />
    </PublicPolicyDocument>
  );
}
