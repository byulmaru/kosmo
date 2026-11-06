import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, useMutation } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { TextArea } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes, spacing, textStyles } from '@/theme/tokens';
import type {
  SettingsNaturalLanguageMute_profile$data,
  SettingsNaturalLanguageMute_profile$key,
} from './__generated__/SettingsNaturalLanguageMute_profile.graphql';
import type { SettingsNaturalLanguageMuteCreateMutation } from './__generated__/SettingsNaturalLanguageMuteCreateMutation.graphql';
import type { SettingsNaturalLanguageMuteDeleteMutation } from './__generated__/SettingsNaturalLanguageMuteDeleteMutation.graphql';
import type { SettingsNaturalLanguageMuteQuery } from './__generated__/SettingsNaturalLanguageMuteQuery.graphql';
import type { SettingsNaturalLanguageMuteUpdateMutation } from './__generated__/SettingsNaturalLanguageMuteUpdateMutation.graphql';

const query = graphql`
  query SettingsNaturalLanguageMuteQuery {
    currentSession {
      selectedProfile {
        ...SettingsNaturalLanguageMute_profile
      }
    }
  }
`;

const profileFragment = graphql`
  fragment SettingsNaturalLanguageMute_profile on Profile {
    id
    instance {
      kind
    }
    viewerState {
      membership {
        role
      }
    }
    naturalLanguageMuteRules {
      id
      condition
    }
  }
`;

const createMutation = graphql`
  mutation SettingsNaturalLanguageMuteCreateMutation($input: CreateNaturalLanguageMuteRuleInput!) {
    createNaturalLanguageMuteRule(input: $input) {
      profile {
        id
        ...SettingsNaturalLanguageMute_profile
      }
    }
  }
`;

const updateMutation = graphql`
  mutation SettingsNaturalLanguageMuteUpdateMutation($input: UpdateNaturalLanguageMuteRuleInput!) {
    updateNaturalLanguageMuteRule(input: $input) {
      profile {
        id
        ...SettingsNaturalLanguageMute_profile
      }
    }
  }
`;

const deleteMutation = graphql`
  mutation SettingsNaturalLanguageMuteDeleteMutation($input: DeleteNaturalLanguageMuteRuleInput!) {
    deleteNaturalLanguageMuteRule(input: $input) {
      naturalLanguageMuteRuleId @deleteRecord
      profile {
        id
        ...SettingsNaturalLanguageMute_profile
      }
    }
  }
`;

type Feedback = 'save-error' | 'delete-error' | null;

export function SettingsNaturalLanguageMute() {
  return (
    <RouteBoundary
      loading={<StateView loading title="제외 조건을 불러오는 중입니다." />}
      title="제외 조건을 불러오지 못했어요"
    >
      <SettingsNaturalLanguageMuteContent />
    </RouteBoundary>
  );
}

function SettingsNaturalLanguageMuteContent() {
  const { fetchKey, fetchPolicy } = useRouteBoundary();
  const shellChrome = useShellChrome();
  const data = useLazyLoadQuery<SettingsNaturalLanguageMuteQuery>(
    query,
    {},
    { fetchKey, fetchPolicy },
  );
  const profileRef = data.currentSession?.selectedProfile ?? null;
  const profile = useFragment<SettingsNaturalLanguageMute_profile$key>(profileFragment, profileRef);

  if (!profile || profile.instance?.kind !== 'LOCAL') {
    return (
      <StateView
        actionLabel={shellChrome ? 'Profile 선택하기' : undefined}
        onAction={shellChrome?.openProfileSwitcher}
        title="설정할 Profile이 없어요"
      />
    );
  }

  const role = profile.viewerState?.membership?.role;
  if (role !== 'MEMBER' && role !== 'OWNER') {
    return <StateView title="이 Profile의 멤버만 제외 조건을 관리할 수 있어요." />;
  }

  return <SettingsNaturalLanguageMuteEditor key={`${profile.id}:${role}`} profile={profile} />;
}

function SettingsNaturalLanguageMuteEditor({
  profile,
}: {
  profile: SettingsNaturalLanguageMute_profile$data;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [commitCreate, creating] =
    useMutation<SettingsNaturalLanguageMuteCreateMutation>(createMutation);
  const [commitUpdate, updating] =
    useMutation<SettingsNaturalLanguageMuteUpdateMutation>(updateMutation);
  const [commitDelete, deleting] =
    useMutation<SettingsNaturalLanguageMuteDeleteMutation>(deleteMutation);
  const ruleList = profile.naturalLanguageMuteRules;
  if (ruleList === null || ruleList === undefined) {
    throw new Error('Natural Language Mute Rules unavailable');
  }
  const rule = ruleList[0] ?? null;
  const pending = creating || updating || deleting;
  const saving = creating || updating;
  const condition = draft ?? rule?.condition ?? '';
  const normalizedCondition = condition.trim();
  const validationError =
    draft !== null && !normalizedCondition ? '제외 조건을 입력해 주세요.' : undefined;
  const canSave =
    !pending && normalizedCondition.length > 0 && normalizedCondition !== rule?.condition;

  const save = () => {
    if (!canSave) {
      return;
    }

    setFeedback(null);
    if (rule) {
      commitUpdate({
        onCompleted: (response) => {
          const updatedProfile = response.updateNaturalLanguageMuteRule?.profile;
          if (updatedProfile?.id !== profile.id) {
            setFeedback('save-error');
            return;
          }
          setDraft(null);
        },
        onError: () => setFeedback('save-error'),
        variables: {
          input: { naturalLanguageMuteRuleId: rule.id, condition: normalizedCondition },
        },
      });
      return;
    }

    commitCreate({
      onCompleted: (response) => {
        const createdProfile = response.createNaturalLanguageMuteRule?.profile;
        if (createdProfile?.id !== profile.id) {
          setFeedback('save-error');
          return;
        }
        setDraft(null);
      },
      onError: () => setFeedback('save-error'),
      variables: { input: { condition: normalizedCondition } },
    });
  };

  const remove = () => {
    if (!rule || pending) {
      return;
    }

    setFeedback(null);
    commitDelete({
      onCompleted: (response) => {
        const result = response.deleteNaturalLanguageMuteRule;
        const updatedProfile = result?.profile;
        if (result?.naturalLanguageMuteRuleId !== rule.id || updatedProfile?.id !== profile.id) {
          setFeedback('delete-error');
          return;
        }
        setDraft(null);
      },
      onError: () => setFeedback('delete-error'),
      variables: { input: { naturalLanguageMuteRuleId: rule.id } },
    });
  };

  return (
    <View style={styles.root}>
      <TextArea
        editable={!pending}
        error={validationError}
        label="제외 조건"
        onChangeText={(value) => setDraft(value)}
        value={condition}
      />
      <View style={styles.actions}>
        <Button
          accessibilityState={{ busy: saving, disabled: !canSave }}
          aria-busy={saving || undefined}
          disabled={!canSave}
          loading={saving}
          loadingText="저장 중"
          onPress={save}
        >
          저장
        </Button>
        {rule ? (
          <Button
            accessibilityState={{ busy: deleting, disabled: pending }}
            aria-busy={deleting || undefined}
            disabled={pending}
            loading={deleting}
            loadingText="삭제 중"
            onPress={remove}
            tone="secondary"
          >
            삭제
          </Button>
        ) : null}
      </View>
      {feedback ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.feedbackDangerBase }]}
        >
          {feedback === 'save-error'
            ? '제외 조건을 저장하지 못했어요. 다시 시도해 주세요.'
            : '제외 조건을 삭제하지 못했어요. 다시 시도해 주세요.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...layoutRecipes.formStack, padding: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: textStyles.uiCopyM,
});
