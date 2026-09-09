import { useCallback, useEffect, useRef } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import type { ProfileMuteControllerMuteMutation } from './__generated__/ProfileMuteControllerMuteMutation.graphql';
import type { ProfileMuteControllerUnmuteMutation } from './__generated__/ProfileMuteControllerUnmuteMutation.graphql';

const muteProfileMutation = graphql`
  mutation ProfileMuteControllerMuteMutation($connections: [ID!]!, $id: ID!) {
    muteProfile(input: { id: $id }) {
      profileMute
        @prependNode(connections: $connections, edgeTypeName: "ProfileMuteConnectionEdge") {
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
  mutation ProfileMuteControllerUnmuteMutation($connections: [ID!]!, $id: ID!) {
    unmuteProfile(input: { id: $id }) {
      profileMuteId @deleteEdge(connections: $connections)
      deletedProfileMuteId: profileMuteId @deleteRecord
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
`;

const profileMuteConnectionKey = 'SettingsMutedProfiles_profileMutes';

export type ProfileMuteChange = Readonly<{
  ownerProfileId: string;
  profileMuteId?: string | null;
  targetProfileId: string;
}>;

const staleRequestError = () => new Error('Profile mute request belongs to an inactive Profile.');

function responseError(errors: ReadonlyArray<{ message: string }> | null | undefined) {
  return errors?.[0] ? new Error(errors[0].message) : null;
}

export function useProfileMuteMutations() {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const { selectedProfileId } = useSession();
  const [commitMute] = useMutation<ProfileMuteControllerMuteMutation>(muteProfileMutation);
  const [commitUnmute] = useMutation<ProfileMuteControllerUnmuteMutation>(unmuteProfileMutation);
  const mountedRef = useRef(true);
  const currentEnvironmentRef = useRef(environment);
  const selectedProfileIdRef = useRef(selectedProfileId);

  currentEnvironmentRef.current = environment;
  selectedProfileIdRef.current = selectedProfileId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const changeMuted = useCallback(
    (change: ProfileMuteChange, nextMuted: boolean) => {
      const requestEnvironment = environment;
      const requestGeneration = environmentGenerationRef?.current;
      const connectionId = ConnectionHandler.getConnectionID(
        change.ownerProfileId,
        profileMuteConnectionKey,
      );
      const connections = requestEnvironment.getStore().getSource().has(connectionId)
        ? [connectionId]
        : [];

      return new Promise<void>((resolve, reject) => {
        if (
          !selectedProfileId ||
          selectedProfileId !== change.ownerProfileId ||
          (nextMuted === false && !change.profileMuteId)
        ) {
          reject(new Error('Profile mute request is missing its selected Profile identity.'));
          return;
        }
        const isCurrent = () =>
          mountedRef.current &&
          currentEnvironmentRef.current === requestEnvironment &&
          environmentGenerationRef?.current === requestGeneration &&
          selectedProfileIdRef.current === change.ownerProfileId;
        const finish = (error?: Error) => {
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
                const profileMute = response?.muteProfile?.profileMute;
                if (error || !profileMute) {
                  finish(error ?? new Error('Profile mute response did not confirm the relation.'));
                  return;
                }
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { connections, id: change.targetProfileId },
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
                const responseProfileMuteId = response?.unmuteProfile?.profileMuteId;
                if (
                  error ||
                  (responseProfileMuteId !== null && responseProfileMuteId !== profileMuteId)
                ) {
                  finish(
                    error ?? new Error('Profile unmute response did not confirm the relation.'),
                  );
                  return;
                }
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { connections, id: profileMuteId },
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [commitMute, commitUnmute, environment, environmentGenerationRef, selectedProfileId],
  );

  return { changeMuted };
}
