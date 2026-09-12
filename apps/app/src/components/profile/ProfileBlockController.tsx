import { useCallback, useEffect, useRef } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { useSession } from '@/session/SessionProvider';
import { StaleProfileBlockRequestError } from './profileBlockErrors';
import type { ProfileBlockControllerBlockMutation } from './__generated__/ProfileBlockControllerBlockMutation.graphql';
import type { ProfileBlockControllerUnblockMutation } from './__generated__/ProfileBlockControllerUnblockMutation.graphql';

const blockProfileMutation = graphql`
  mutation ProfileBlockControllerBlockMutation($connections: [ID!]!, $id: ID!) {
    blockProfile(input: { id: $id }) {
      profileBlock
        @prependNode(connections: $connections, edgeTypeName: "ProfileBlockConnectionEdge") {
        id
        targetProfile {
          id
          viewerState {
            profileBlock {
              id
            }
          }
        }
      }
    }
  }
`;

const unblockProfileMutation = graphql`
  mutation ProfileBlockControllerUnblockMutation($connections: [ID!]!, $id: ID!) {
    unblockProfile(input: { id: $id }) {
      profileBlockId @deleteEdge(connections: $connections)
      deletedProfileBlockId: profileBlockId @deleteRecord
      targetProfile {
        id
        viewerState {
          profileBlock {
            id
          }
        }
      }
    }
  }
`;

export type ProfileBlockChange = Readonly<{
  ownerProfileId: string;
  profileBlockId?: string | null;
  targetProfileId?: string | null;
}>;

function responseError(errors: ReadonlyArray<{ message: string }> | null | undefined) {
  return errors?.length ? new Error(errors[0]?.message ?? 'Profile block request failed.') : null;
}

export function useProfileBlockMutations() {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const [commitBlock] = useMutation<ProfileBlockControllerBlockMutation>(blockProfileMutation);
  const [commitUnblock] =
    useMutation<ProfileBlockControllerUnblockMutation>(unblockProfileMutation);
  const mountedRef = useRef(false);
  const selectedProfileIdRef = useRef(selectedProfileId);
  selectedProfileIdRef.current = selectedProfileId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const changeBlocked = useCallback(
    (change: ProfileBlockChange, nextBlocked: boolean) => {
      const connectionId = ConnectionHandler.getConnectionID(
        change.ownerProfileId,
        'SettingsBlockedProfiles_profileBlocks',
      );
      const connections = environment.getStore().getSource().has(connectionId)
        ? [connectionId]
        : [];

      return new Promise<void>((resolve, reject) => {
        if (
          !selectedProfileId ||
          selectedProfileId !== change.ownerProfileId ||
          (nextBlocked && !change.targetProfileId) ||
          (!nextBlocked && !change.profileBlockId)
        ) {
          reject(new Error('Profile block request is missing its selected Profile identity.'));
          return;
        }
        const finish = (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const finishStale = () => finish(new StaleProfileBlockRequestError());

        try {
          if (nextBlocked) {
            commitBlock({
              onCompleted: (response, errors) => {
                const profileBlock = response.blockProfile?.profileBlock;
                const profileBlockId = profileBlock?.id;
                if (!mountedRef.current || selectedProfileIdRef.current !== change.ownerProfileId) {
                  finishStale();
                  return;
                }
                const error = responseError(errors);
                if (error || !profileBlockId) {
                  finish(
                    error ?? new Error('Profile block response did not confirm the relation.'),
                  );
                  return;
                }
                finish();
              },
              onError: (error) => {
                if (!mountedRef.current || selectedProfileIdRef.current !== change.ownerProfileId) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { connections, id: change.targetProfileId as string },
            });
          } else {
            commitUnblock({
              onCompleted: (response, errors) => {
                if (!mountedRef.current || selectedProfileIdRef.current !== change.ownerProfileId) {
                  finishStale();
                  return;
                }
                const error = responseError(errors);
                const responseProfileBlockId = response.unblockProfile?.profileBlockId;
                if (error || responseProfileBlockId !== change.profileBlockId) {
                  finish(
                    error ?? new Error('Profile unblock response did not confirm the relation.'),
                  );
                  return;
                }
                finish();
              },
              onError: (error) => {
                if (!mountedRef.current || selectedProfileIdRef.current !== change.ownerProfileId) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { connections, id: change.profileBlockId as string },
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [commitBlock, commitUnblock, environment, selectedProfileId],
  );

  return { changeBlocked };
}
