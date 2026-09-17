import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
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
  visible: boolean;
  visibility: PostVisibility;
}>;

type SaveState = 'idle' | 'saving' | 'success' | 'error';

const saveFailureMessage = '인용 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function PostQuotePolicyEditor({ onClose, postId, policy, visibility, visible }: Props) {
  const theme = useTheme();
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const environmentRef = useRef(environment);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<number | null>(null);
  const [selected, setSelected] = useState(policy);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [commit] = useMutation<PostQuotePolicyEditorMutation>(UpdatePostQuotePolicyMutation);

  useEffect(() => {
    if (environmentRef.current !== environment) {
      environmentRef.current = environment;
      requestIdRef.current += 1;
      inFlightRef.current = null;
      setSaveState('idle');
    }
  }, [environment]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelected(policy);
    setSaveState('idle');
  }, [policy, postId, visible]);

  const save = useCallback(
    (nextPolicy: PostQuotePolicy) => {
      if (nextPolicy === policy || inFlightRef.current !== null || !visible) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      inFlightRef.current = requestId;
      const environmentGeneration = environmentGenerationRef?.current;
      setSelected(nextPolicy);
      setSaveState('saving');

      const finish = (state: SaveState) => {
        if (
          inFlightRef.current !== requestId ||
          environmentGenerationRef?.current !== environmentGeneration
        ) {
          if (inFlightRef.current === requestId) {
            inFlightRef.current = null;
          }
          return;
        }
        inFlightRef.current = null;
        setSaveState(state);
      };

      commit({
        variables: { input: { id: postId, quotePolicy: nextPolicy } },
        onCompleted: (response, errors) => {
          if (errors?.length || !response.updatePostQuotePolicy.post.quotePolicy) {
            finish('error');
            return;
          }
          finish('success');
          onClose();
        },
        onError: () => finish('error'),
      });
    },
    [commit, environmentGenerationRef, onClose, policy, postId, visible],
  );

  const saving = saveState === 'saving';
  const currentLabel = postQuotePolicyPresentation[selected].label;

  return (
    <ModalSheet dismissDisabled={saving} onClose={onClose} title="인용 설정" visible={visible}>
      <Text style={[styles.summary, { color: theme.foregroundSecondary }]}>
        현재 인용 허용: {currentLabel}
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
      {saveState === 'error' ? (
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
