import { useCallback, useEffect, useRef } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import { StaleProfileBlockRequestError } from './profileBlockErrors';
import type { RecordSourceProxy } from 'relay-runtime';
import type { ProfileBlockControllerBlockMutation } from './__generated__/ProfileBlockControllerBlockMutation.graphql';
import type { ProfileBlockControllerUnblockMutation } from './__generated__/ProfileBlockControllerUnblockMutation.graphql';

const blockProfileMutation = graphql`
  mutation ProfileBlockControllerBlockMutation($id: ID!) {
    blockProfile(input: { id: $id }) {
      success
      profileBlock {
        id
        targetProfile {
          id
          displayName
          relativeHandle
        }
      }
    }
  }
`;

const unblockProfileMutation = graphql`
  mutation ProfileBlockControllerUnblockMutation($id: ID!) {
    unblockProfile(input: { id: $id }) {
      success
      profileBlockId
    }
  }
`;

const profileBlockConnectionKey = 'SettingsBlockedProfiles_profileBlocks';

export type ProfileBlockChange = Readonly<{
  ownerProfileId: string;
  profileBlockId?: string | null;
  targetProfileId: string;
}>;

function updateLoadedBlockState(
  store: RecordSourceProxy,
  connectionId: string,
  profileBlockId: string,
  targetProfileId: string,
) {
  const profileBlock = store.get(profileBlockId);
  const targetProfile = store.get(targetProfileId);
  if (!profileBlock || !targetProfile) {
    return false;
  }

  profileBlock.setLinkedRecord(targetProfile, 'targetProfile');
  targetProfile.getLinkedRecord('viewerState')?.setLinkedRecord(profileBlock, 'profileBlock');

  const connection = store.get(connectionId);
  const alreadyConnected = connection
    ?.getLinkedRecords('edges')
    ?.some((edge) => edge.getLinkedRecord('node')?.getDataID() === profileBlockId);
  if (connection && !alreadyConnected) {
    const edge = ConnectionHandler.createEdge(
      store,
      connection,
      profileBlock,
      'ProfileBlockConnectionEdge',
    );
    ConnectionHandler.insertEdgeBefore(connection, edge);
  }
  return true;
}

function updateLoadedUnblockState(
  store: RecordSourceProxy,
  connectionId: string,
  profileBlockId: string,
  targetProfileId: string,
) {
  const connection = store.get(connectionId);
  if (connection) {
    ConnectionHandler.deleteNode(connection, profileBlockId);
  }

  const viewerState = store.get(targetProfileId)?.getLinkedRecord('viewerState');
  if (viewerState?.getLinkedRecord('profileBlock')?.getDataID() === profileBlockId) {
    viewerState.setValue(null, 'profileBlock');
  }
  store.delete(profileBlockId);
}

export function useProfileBlockMutations() {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const { selectedProfileId } = useSession();
  const [commitBlock] = useMutation<ProfileBlockControllerBlockMutation>(blockProfileMutation);
  const [commitUnblock] =
    useMutation<ProfileBlockControllerUnblockMutation>(unblockProfileMutation);
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

  const changeBlocked = useCallback(
    (change: ProfileBlockChange, nextBlocked: boolean) => {
      const requestEnvironment = environment;
      const requestGeneration = environmentGenerationRef?.current;
      const connectionId = ConnectionHandler.getConnectionID(
        change.ownerProfileId,
        profileBlockConnectionKey,
      );

      return new Promise<void>((resolve, reject) => {
        if (
          !selectedProfileId ||
          selectedProfileId !== change.ownerProfileId ||
          !change.targetProfileId ||
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
        const isCurrent = () =>
          mountedRef.current &&
          currentEnvironmentRef.current === requestEnvironment &&
          environmentGenerationRef?.current === requestGeneration &&
          selectedProfileIdRef.current === change.ownerProfileId;
        try {
          if (nextBlocked) {
            commitBlock({
              onCompleted: (response) => {
                const profileBlock = response.blockProfile?.profileBlock;
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                if (!response.blockProfile?.success || !profileBlock) {
                  finish(new Error('Profile block response did not confirm the relation.'));
                  return;
                }
                requestEnvironment.commitUpdate((store) => {
                  updateLoadedBlockState(
                    store,
                    connectionId,
                    profileBlock.id,
                    change.targetProfileId,
                  );
                });
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { id: change.targetProfileId },
            });
          } else {
            commitUnblock({
              onCompleted: (response) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                const responseProfileBlockId = response.unblockProfile?.profileBlockId;
                if (
                  !response.unblockProfile?.success ||
                  !responseProfileBlockId ||
                  responseProfileBlockId !== change.profileBlockId
                ) {
                  finish(new Error('Profile unblock response did not confirm the relation.'));
                  return;
                }
                requestEnvironment.commitUpdate((store) => {
                  updateLoadedUnblockState(
                    store,
                    connectionId,
                    responseProfileBlockId,
                    change.targetProfileId,
                  );
                });
                finish();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { id: change.profileBlockId as string },
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [commitBlock, commitUnblock, environment, environmentGenerationRef, selectedProfileId],
  );

  return { changeBlocked };
}
