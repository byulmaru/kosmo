import { useCallback, useEffect, useRef } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import { addProfileMuteToStore, removeProfileMuteFromStore } from './profileMuteCache';
import type { ProfileMuteControllerMuteMutation } from './__generated__/ProfileMuteControllerMuteMutation.graphql';
import type { ProfileMuteControllerUnmuteMutation } from './__generated__/ProfileMuteControllerUnmuteMutation.graphql';

const muteProfileMutation = graphql`
  mutation ProfileMuteControllerMuteMutation($id: ID!) {
    muteProfile(input: { id: $id }) {
      profileMute {
        id
        targetProfile {
          id
          viewerState {
            profileMute {
              id
            }
          }
        }
      }
    }
  }
`;

const unmuteProfileMutation = graphql`
  mutation ProfileMuteControllerUnmuteMutation($id: ID!) {
    unmuteProfile(input: { id: $id }) {
      profileMuteId
    }
  }
`;

export type ProfileMuteChange = Readonly<{
  ownerProfileId: string;
  profileMuteId?: string | null;
  targetProfileId: string;
}>;

type ActiveRequest = Readonly<{
  environment: ReturnType<typeof useRelayEnvironment>;
  generation: number | undefined;
  ownerProfileId: string;
  targetProfileId: string;
  token: number;
}>;

const staleRequestError = () => new Error('Profile mute request belongs to an inactive Profile.');

function responseError(errors: ReadonlyArray<{ message: string }> | null | undefined) {
  return errors?.[0] ? new Error(errors[0].message) : null;
}

export function useProfileMuteMutations() {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const shellChrome = useShellChrome();
  const { selectedProfileId } = useSession();
  const [commitMute] = useMutation<ProfileMuteControllerMuteMutation>(muteProfileMutation);
  const [commitUnmute] = useMutation<ProfileMuteControllerUnmuteMutation>(unmuteProfileMutation);
  const mountedRef = useRef(true);
  const currentEnvironmentRef = useRef(environment);
  const selectedProfileIdRef = useRef(selectedProfileId);
  const nextTokenRef = useRef(0);
  const activeRequestsRef = useRef(new Map<string, ActiveRequest>());

  currentEnvironmentRef.current = environment;
  selectedProfileIdRef.current = selectedProfileId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeRequestsRef.current.clear();
  }, [environment, selectedProfileId]);

  const changeMuted = useCallback(
    (change: ProfileMuteChange, nextMuted: boolean) => {
      const requestEnvironment = environment;
      const requestGeneration = environmentGenerationRef?.current;
      const requestKey = `${change.ownerProfileId}:${change.targetProfileId}`;
      const request: ActiveRequest = {
        environment: requestEnvironment,
        generation: requestGeneration,
        ownerProfileId: change.ownerProfileId,
        targetProfileId: change.targetProfileId,
        token: nextTokenRef.current + 1,
      };
      nextTokenRef.current = request.token;

      return new Promise<void>((resolve, reject) => {
        if (
          !selectedProfileId ||
          selectedProfileId !== change.ownerProfileId ||
          (nextMuted === false && !change.profileMuteId)
        ) {
          reject(new Error('Profile mute request is missing its selected Profile identity.'));
          return;
        }
        if (activeRequestsRef.current.has(requestKey)) {
          reject(new Error('Profile mute request is already in progress.'));
          return;
        }
        activeRequestsRef.current.set(requestKey, request);

        const isCurrent = () =>
          mountedRef.current &&
          currentEnvironmentRef.current === request.environment &&
          environmentGenerationRef?.current === request.generation &&
          selectedProfileIdRef.current === request.ownerProfileId &&
          activeRequestsRef.current.get(requestKey)?.token === request.token;
        const finish = (error?: Error) => {
          if (activeRequestsRef.current.get(requestKey)?.token === request.token) {
            activeRequestsRef.current.delete(requestKey);
          }
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const finishStale = () => finish(staleRequestError());

        try {
          if (nextMuted) {
            commitMute({
              onCompleted: (response, errors) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                const error = responseError(errors);
                const profileMute = response.muteProfile?.profileMute;
                if (error || !profileMute) {
                  finish(error ?? new Error('Profile mute response did not confirm the relation.'));
                  return;
                }
                shellChrome?.refreshProfileMuteTimelines?.();
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              updater: (store) => {
                if (!isCurrent()) {
                  return;
                }
                const profileMute = store
                  .getRootField('muteProfile')
                  ?.getLinkedRecord('profileMute');
                if (profileMute) {
                  addProfileMuteToStore(
                    store,
                    change.ownerProfileId,
                    profileMute.getDataID(),
                    change.targetProfileId,
                  );
                }
              },
              variables: { id: change.targetProfileId },
            });
          } else {
            const profileMuteId = change.profileMuteId as string;
            commitUnmute({
              onCompleted: (response, errors) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                const error = responseError(errors);
                const responseProfileMuteId = response.unmuteProfile?.profileMuteId;
                if (
                  error ||
                  (responseProfileMuteId !== null && responseProfileMuteId !== profileMuteId)
                ) {
                  finish(
                    error ?? new Error('Profile unmute response did not confirm the relation.'),
                  );
                  return;
                }
                requestEnvironment.commitUpdate((store) =>
                  removeProfileMuteFromStore(
                    store,
                    change.ownerProfileId,
                    profileMuteId,
                    change.targetProfileId,
                  ),
                );
                shellChrome?.refreshProfileMuteTimelines?.();
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { id: profileMuteId },
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [
      commitMute,
      commitUnmute,
      environment,
      environmentGenerationRef,
      selectedProfileId,
      shellChrome,
    ],
  );

  return { changeMuted };
}
