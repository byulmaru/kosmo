import { useCallback } from 'react';
import { graphql, useFragment, useMutation } from 'react-relay';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useSession } from '@/session/SessionProvider';
import { CoachmarkMetadataKey } from './CoachmarkGuide';
import { useCoachmark } from './CoachmarkProvider';
import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { CoachmarkController_account$key } from './__generated__/CoachmarkController_account.graphql';
import type { CoachmarkControllerSetMetadataMutation } from './__generated__/CoachmarkControllerSetMetadataMutation.graphql';
import type { CoachmarkGuide } from './CoachmarkGuide';
import type { CoachmarkRequestHandle, CoachmarkStep } from './CoachmarkProvider';

const accountFragment = graphql`
  fragment CoachmarkController_account on Account {
    id
    profiles {
      id
    }
    metadata(
      keys: [
        "coachmark.timeline.shown"
        "coachmark.search.shown"
        "coachmark.tag.shown"
        "coachmark.profile.shown"
        "coachmark.post.shown"
        "coachmark.composer.shown"
      ]
    ) {
      key
      value
    }
  }
`;

const setAccountMetadataMutation = graphql`
  mutation CoachmarkControllerSetMetadataMutation($input: SetAccountMetadataInput!) {
    setAccountMetadata(input: $input) {
      key
      value
      account {
        ...CoachmarkController_account
      }
    }
  }
`;

type CoachmarkControllerOptions = Readonly<{
  account: CoachmarkController_account$key | null | undefined;
  guide: CoachmarkGuide;
  onExit?: () => void;
  preferredFocusRef?: RefObject<NativeView | HTMLElement | null>;
  ready: boolean;
  steps: readonly CoachmarkStep[];
}>;

type CoachmarkController = Readonly<{
  open: () => CoachmarkRequestHandle | null;
  requestAutoStart: () => CoachmarkRequestHandle | null;
}>;

export function useCoachmarkController({
  account: accountKey,
  guide,
  onExit,
  preferredFocusRef,
  ready,
  steps,
}: CoachmarkControllerOptions): CoachmarkController {
  const account = useFragment(accountFragment, accountKey);
  const { request } = useCoachmark();
  const session = useSession();
  const reportUnexpectedError = useUnexpectedErrorReporter();
  const [commitMetadata] = useMutation<CoachmarkControllerSetMetadataMutation>(
    setAccountMetadataMutation,
  );

  const onShown = useCallback(() => {
    if (!account) {
      return;
    }

    commitMetadata({
      variables: { input: { key: CoachmarkMetadataKey[guide], value: 'true' } },
      onCompleted: (_response, errors) => {
        if (errors?.length) {
          reportUnexpectedError?.(errors, { componentStack: 'CoachmarkController' });
        }
      },
      onError: (error) => reportUnexpectedError?.(error, { componentStack: 'CoachmarkController' }),
    });
  }, [account, commitMetadata, guide, reportUnexpectedError]);

  const requestCoachmark = useCallback(
    (mode: 'automatic' | 'manual') => {
      return request({
        accountId: account?.id,
        guide,
        mode,
        onExit,
        onShown,
        preferredFocusRef,
        ready,
        steps,
      });
    },
    [account, guide, onExit, onShown, preferredFocusRef, ready, request, steps],
  );

  return {
    open: useCallback(() => requestCoachmark('manual'), [requestCoachmark]),
    requestAutoStart: useCallback(() => {
      if (
        session.status !== 'valid' ||
        !account ||
        account.profiles.length === 0 ||
        account.metadata.some(
          (metadata) => metadata.key === CoachmarkMetadataKey[guide] && metadata.value === 'true',
        )
      ) {
        return null;
      }
      return requestCoachmark('automatic');
    }, [account, guide, requestCoachmark, session.status]),
  };
}

export type { CoachmarkController_account$key };
