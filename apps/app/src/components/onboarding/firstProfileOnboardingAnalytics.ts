import { setPendingOnboardingHomeView, trackAnalyticsForAccount } from '@/analytics/client';
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  FirstProfileOnboardingAction,
  FirstProfileOnboardingOperation,
  FirstProfileOnboardingStep,
} from '@/analytics/events';

export type FirstProfileOperationToken = {
  id: number;
  step: FirstProfileOnboardingStep;
  operation: FirstProfileOnboardingOperation;
  attempt: number;
  actionSequence?: number;
  tagIndex?: number;
};

export type FirstProfileFollowAction = 'follow' | 'unfollow' | 'cancel_request';
export type FirstProfileFollowOutcome = 'relationship' | 'request' | 'removed' | 'failed';

export type FirstProfileFollowAnalytics = {
  begin: (targetProfileId: string, action: FirstProfileFollowAction) => FirstProfileOperationToken;
  finish: (
    token: FirstProfileOperationToken,
    targetProfileId: string,
    outcome: FirstProfileFollowOutcome,
    selectedProfileId?: string,
    errorType?: 'network' | 'response' | 'unknown',
  ) => void;
};

export type FirstProfileOnboardingAnalytics = {
  flowId: string;
  viewStep: (step: FirstProfileOnboardingStep) => void;
  action: (
    step: FirstProfileOnboardingStep,
    action: FirstProfileOnboardingAction,
    tagIndex?: number,
  ) => number;
  beginOperation: (
    step: FirstProfileOnboardingStep,
    operation: FirstProfileOnboardingOperation,
    actionSequence?: number,
    tagIndex?: number,
  ) => FirstProfileOperationToken;
  finishOperation: (
    token: FirstProfileOperationToken,
    result: 'succeeded' | 'failed' | 'not_observed',
    errorType?: 'validation' | 'network' | 'response' | 'media' | 'unknown',
  ) => void;
  savedTagsLoaded: (token: FirstProfileOperationToken, count: number) => void;
  savedTagsFailed: (
    token: FirstProfileOperationToken,
    errorType: 'network' | 'response' | 'unknown',
  ) => void;
  relatedProfilesLoaded: (token: FirstProfileOperationToken, resultCount: number) => void;
  relatedProfilesFailed: (
    token: FirstProfileOperationToken,
    errorType: 'network' | 'response' | 'unknown',
  ) => void;
  hasRelatedProfilesResult: (tagIndex: number) => boolean;
  completeOnboarding: (exitReason: 'no_saved_tags' | 'continued') => void;
  profileCreated: (profileId: string, token: FirstProfileOperationToken) => void;
  profileSelected: (profileId: string, token: FirstProfileOperationToken) => void;
  follow: FirstProfileFollowAnalytics;
};

const createFlowId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createFirstProfileOnboardingAnalytics(
  accountId: string,
): FirstProfileOnboardingAnalytics {
  const flowId = createFlowId();
  let hasStarted = false;
  let completionRecorded = false;
  let actionSequence = 0;
  let operationId = 0;
  let savedTagCount: number | null = null;
  const stepVisits = new Map<FirstProfileOnboardingStep, number>();
  const operationAttempts = new Map<FirstProfileOnboardingOperation, number>();
  const createdProfileIds = new Set<string>();
  const selectedProfileIds = new Set<string>();
  const pendingOperations = new Map<number, FirstProfileOperationToken>();
  const finishedOperations = new Set<number>();
  const pendingFollowOperations = new Set<number>();
  const followedProfiles = new Map<string, 'relationship' | 'request'>();
  const resolvedRelatedTagIndices = new Set<number>();

  const capture = <Name extends AnalyticsEventName>(
    eventName: Name,
    properties: AnalyticsEventProperties[Name],
  ) => trackAnalyticsForAccount(accountId, eventName, properties);

  const viewStep = (step: FirstProfileOnboardingStep) => {
    if (step === 'handle' && !hasStarted) {
      hasStarted = true;
      capture('first_profile_onboarding_started', { flow_id: flowId });
    }

    const visitSequence = (stepVisits.get(step) ?? 0) + 1;
    stepVisits.set(step, visitSequence);
    capture('first_profile_onboarding_step_viewed', {
      flow_id: flowId,
      step,
      visit_sequence: visitSequence,
    });
  };

  const recordAction = (
    step: FirstProfileOnboardingStep,
    action: FirstProfileOnboardingAction,
    tagIndex?: number,
  ) => {
    actionSequence += 1;
    capture('first_profile_onboarding_action', {
      flow_id: flowId,
      step,
      action,
      action_sequence: actionSequence,
      ...(tagIndex === undefined ? {} : { tag_index: tagIndex }),
    });
    return actionSequence;
  };

  const beginOperation = (
    step: FirstProfileOnboardingStep,
    operation: FirstProfileOnboardingOperation,
    sequence?: number,
    tagIndex?: number,
  ): FirstProfileOperationToken => {
    const attempt = (operationAttempts.get(operation) ?? 0) + 1;
    operationAttempts.set(operation, attempt);
    const token: FirstProfileOperationToken = {
      id: ++operationId,
      step,
      operation,
      attempt,
      ...(sequence === undefined ? {} : { actionSequence: sequence }),
      ...(tagIndex === undefined ? {} : { tagIndex }),
    };
    pendingOperations.set(token.id, token);
    return token;
  };

  const finishOperation = (
    token: FirstProfileOperationToken,
    result: 'succeeded' | 'failed' | 'not_observed',
    errorType?: 'validation' | 'network' | 'response' | 'media' | 'unknown',
  ): boolean => {
    if (!pendingOperations.delete(token.id) || finishedOperations.has(token.id)) {
      return false;
    }
    finishedOperations.add(token.id);
    capture('first_profile_onboarding_operation', {
      flow_id: flowId,
      step: token.step,
      operation: token.operation,
      result,
      operation_attempt: token.attempt,
      ...(token.actionSequence === undefined ? {} : { action_sequence: token.actionSequence }),
      ...(token.tagIndex === undefined ? {} : { tag_index: token.tagIndex }),
      ...(errorType === undefined ? {} : { error_type: errorType }),
    });
    return true;
  };

  const currentSavedTagCount = () =>
    savedTagCount === null
      ? { saved_tag_count_status: 'unknown' as const }
      : { saved_tag_count_status: 'known' as const, saved_tag_count: savedTagCount };

  const recordSavedTagResult = (
    token: FirstProfileOperationToken,
    result: 'loaded' | 'empty' | 'failed',
    errorType?: 'network' | 'response' | 'unknown',
  ) => {
    if (!finishOperation(token, result === 'failed' ? 'failed' : 'succeeded', errorType)) {
      return;
    }
    if (token.tagIndex !== undefined) {
      resolvedRelatedTagIndices.add(token.tagIndex);
    }
    capture('first_profile_onboarding_discovery', {
      flow_id: flowId,
      stage: 'saved_tags',
      result,
      ...currentSavedTagCount(),
    });
  };

  const recordRelatedProfilesResult = (
    token: FirstProfileOperationToken,
    result: 'loaded' | 'empty' | 'failed',
    resultCount?: number,
    errorType?: 'network' | 'response' | 'unknown',
  ) => {
    if (!finishOperation(token, result === 'failed' ? 'failed' : 'succeeded', errorType)) {
      return;
    }
    capture('first_profile_onboarding_discovery', {
      flow_id: flowId,
      stage: 'related_profiles',
      result,
      ...(token.tagIndex === undefined ? {} : { tag_index: token.tagIndex }),
      ...(resultCount === undefined ? {} : { result_count: resultCount }),
    });
  };

  const follow: FirstProfileFollowAnalytics = {
    begin: (targetProfileId, action) => {
      const sequence = recordAction('discovery', action);
      const operation =
        action === 'follow'
          ? 'follow_profile'
          : action === 'unfollow'
            ? 'unfollow_profile'
            : 'cancel_follow_request';
      const token = beginOperation('discovery', operation, sequence);
      pendingFollowOperations.add(token.id);
      // The target identity stays in memory so the exit snapshot can count unique relationships.
      void targetProfileId;
      return token;
    },
    finish: (token, targetProfileId, outcome, selectedProfileId, errorType) => {
      if (!pendingFollowOperations.delete(token.id)) {
        return;
      }

      if (outcome === 'relationship' || outcome === 'request') {
        followedProfiles.set(targetProfileId, outcome);
      } else if (outcome === 'removed') {
        followedProfiles.delete(targetProfileId);
      }

      finishOperation(token, outcome === 'failed' ? 'failed' : 'succeeded', errorType);
      if ((outcome === 'relationship' || outcome === 'request') && selectedProfileId) {
        capture('follow_succeeded', {
          selected_profile_id: selectedProfileId,
          result: outcome === 'request' ? 'request' : 'follow',
          flow_id: flowId,
          ...(token.actionSequence === undefined ? {} : { action_sequence: token.actionSequence }),
          operation_attempt: token.attempt,
        });
      }
    },
  };

  return {
    flowId,
    viewStep,
    action: recordAction,
    beginOperation,
    finishOperation,
    savedTagsLoaded: (token, count) => {
      savedTagCount = count;
      recordSavedTagResult(token, count === 0 ? 'empty' : 'loaded');
    },
    savedTagsFailed: (token, errorType) => recordSavedTagResult(token, 'failed', errorType),
    relatedProfilesLoaded: (token, resultCount) =>
      recordRelatedProfilesResult(token, resultCount === 0 ? 'empty' : 'loaded', resultCount),
    relatedProfilesFailed: (token, errorType) =>
      recordRelatedProfilesResult(token, 'failed', undefined, errorType),
    hasRelatedProfilesResult: (tagIndex) => resolvedRelatedTagIndices.has(tagIndex),
    completeOnboarding: (exitReason) => {
      if (completionRecorded) {
        return;
      }
      completionRecorded = true;
      const relationships = [...followedProfiles.values()].filter(
        (result) => result === 'relationship',
      ).length;
      const requests = followedProfiles.size - relationships;
      capture('first_profile_onboarding_completed', {
        flow_id: flowId,
        exit_reason: exitReason,
        ...currentSavedTagCount(),
        follow_relationship_count: relationships,
        follow_request_count: requests,
        follow_operation_pending_count: pendingFollowOperations.size,
        operation_pending_count: pendingOperations.size,
      });
      setPendingOnboardingHomeView(accountId, flowId);
    },
    profileCreated: (profileId, token) => {
      if (createdProfileIds.has(profileId)) {
        return;
      }
      createdProfileIds.add(profileId);
      capture('profile_created', {
        selected_profile_id: profileId,
        flow_id: flowId,
        ...(token.actionSequence === undefined ? {} : { action_sequence: token.actionSequence }),
        operation_attempt: token.attempt,
      });
    },
    profileSelected: (profileId, token) => {
      if (selectedProfileIds.has(profileId)) {
        return;
      }
      selectedProfileIds.add(profileId);
      capture('profile_selected', {
        selected_profile_id: profileId,
        selection_cause: 'auto',
        flow_id: flowId,
        ...(token.actionSequence === undefined ? {} : { action_sequence: token.actionSequence }),
        operation_attempt: token.attempt,
      });
    },
    follow,
  };
}
