import {
  CHILD_SAFETY_POLICY_EFFECTIVE_DATE,
  CHILD_SAFETY_POLICY_TITLE,
  ChildSafetyPolicyContent,
} from '@/components/public-policy/ChildSafetyPolicyContent';
import { PublicPolicyDocument } from '@/components/public-policy/PublicPolicyDocument';

export default function ChildSafetyScreen() {
  return (
    <PublicPolicyDocument
      currentPolicy="child-safety"
      effectiveDate={CHILD_SAFETY_POLICY_EFFECTIVE_DATE}
      testID="child-safety-policy"
      title={CHILD_SAFETY_POLICY_TITLE}
    >
      <ChildSafetyPolicyContent />
    </PublicPolicyDocument>
  );
}
