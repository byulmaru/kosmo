import { useState } from 'react';
import { Text } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, typography } from '@/theme/tokens';
import { postQuotePolicyOptions, postQuotePolicyPresentation } from './postQuotePolicyPresentation';
import { postVisibilityPresentation } from './postVisibilityPresentation';
import type { PostQuotePolicy, PostVisibility } from '@kosmo/core/enums';
import type { PostQuotePolicyEditorMutation } from './__generated__/PostQuotePolicyEditorMutation.graphql';

const UpdatePostQuotePolicyMutation = graphql`
  mutation PostQuotePolicyEditorMutation($input: UpdatePostQuotePolicyInput!) {
    updatePostQuotePolicy(input: $input) {
      post {
        id
        quotePolicy
        viewerCanUpdateQuotePolicy
      }
    }
  }
`;

type Props = Readonly<{
  onClose: () => void;
  postId: string;
  policy: PostQuotePolicy;
  visibility: PostVisibility;
}>;

const saveFailureMessage = '인용 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function PostQuotePolicyEditor({ onClose, postId, policy, visibility }: Props) {
  const theme = useTheme();
  const [selected, setSelected] = useState(policy);
  const [failed, setFailed] = useState(false);
  const [commit, saving] = useMutation<PostQuotePolicyEditorMutation>(
    UpdatePostQuotePolicyMutation,
  );

  const save = (nextPolicy: PostQuotePolicy) => {
    if (saving) {
      return;
    }
    setSelected(nextPolicy);
    setFailed(false);
    if (nextPolicy === policy) {
      return;
    }

    commit({
      variables: { input: { id: postId, quotePolicy: nextPolicy } },
      onCompleted: (response, errors) => {
        if (errors?.length || !response.updatePostQuotePolicy.post.quotePolicy) {
          setFailed(true);
          return;
        }
        onClose();
      },
      onError: () => setFailed(true),
    });
  };

  const currentLabel = postQuotePolicyPresentation[selected].label;

  return (
    <ModalSheet dismissDisabled={saving} onClose={onClose} title="인용 설정" visible>
      <Text style={[styles.summary, { color: theme.foregroundSecondary }]}>
        선택한 인용 허용: {currentLabel}
      </Text>
      <Text style={[styles.summary, { color: theme.foregroundSecondary }]}>
        공개 범위: {postVisibilityPresentation[visibility].label} (읽기 전용)
      </Text>
      <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
        기존 승인에는 소급하지 않고 이후 인용 요청에만 적용됩니다.
      </Text>
      <RadioGroup
        accessibilityLabel="인용 허용 정책"
        disabled={saving}
        onChange={(value) => save(value as PostQuotePolicy)}
        value={selected}
      >
        {postQuotePolicyOptions.map((option) => (
          <RadioOption
            key={option}
            option={{
              description: postQuotePolicyPresentation[option].description,
              label: postQuotePolicyPresentation[option].label,
              value: option,
            }}
          />
        ))}
      </RadioGroup>
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
          {saveFailureMessage}
        </Text>
      ) : null}
    </ModalSheet>
  );
}

const styles = {
  description: { fontFamily: fontFamilies.ui, ...typography.xsm },
  error: { fontFamily: fontFamilies.ui, ...typography.sm },
  summary: { fontFamily: fontFamilies.ui, ...typography.sm },
} as const;
