import { useCallback, useEffect, useRef } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useRelayEnvironmentGeneration } from '@/relay/RelayEnvironmentBoundary';
import { useSession } from '@/session/SessionProvider';
import {
  addProfileBlockToStore,
  removeProfileBlockFromStore,
  updateProfileBlockStatus,
} from './profileBlockCache';
import { StaleProfileBlockRequestError } from './profileBlockErrors';
import type { Environment } from 'relay-runtime';
import type { ProfileBlockControllerBlockMutation } from './__generated__/ProfileBlockControllerBlockMutation.graphql';
import type { ProfileBlockControllerUnblockMutation } from './__generated__/ProfileBlockControllerUnblockMutation.graphql';

const blockProfileMutation = graphql`
  mutation ProfileBlockControllerBlockMutation($id: ID!) {
    blockProfile(input: { id: $id }) {
      profileBlock {
        id
        targetProfile {
          id
        }
      }
    }
  }
`;

const unblockProfileMutation = graphql`
  mutation ProfileBlockControllerUnblockMutation($id: ID!) {
    unblockProfile(input: { id: $id }) {
      profileBlockId
    }
  }
`;

export type ProfileBlockChange = Readonly<{
  handle?: string | null;
  ownerProfileId: string;
  profileBlockId?: string | null;
  targetProfileId?: string | null;
}>;

type ActiveRequest = Readonly<{
  environment: Environment;
  generation: number | undefined;
  existingRecordIds: ReadonlySet<string>;
  ownerProfileId: string;
  token: number;
}>;

function responseError(errors: ReadonlyArray<{ message: string }> | null | undefined) {
  return errors?.length ? new Error(errors[0]?.message ?? 'Profile block request failed.') : null;
}

function discardUnconfirmedProfileBlock(
  request: ActiveRequest,
  profileBlockId: string | null | undefined,
) {
  if (!profileBlockId || request.existingRecordIds.has(profileBlockId)) {
    return;
  }

  request.environment.commitUpdate((store) => {
    store.delete(profileBlockId);
  });
}

export function useProfileBlockMutations() {
  const environment = useRelayEnvironment();
  const environmentGenerationRef = useRelayEnvironmentGeneration();
  const { resetActor } = useRelayActor();
  const { selectedProfileId } = useSession();
  const [commitBlock] = useMutation<ProfileBlockControllerBlockMutation>(blockProfileMutation);
  const [commitUnblock] =
    useMutation<ProfileBlockControllerUnblockMutation>(unblockProfileMutation);
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
      activeRequestsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    activeRequestsRef.current.clear();
  }, [environment, selectedProfileId]);

  const changeBlocked = useCallback(
    (change: ProfileBlockChange, nextBlocked: boolean) => {
      const requestKey = `${change.ownerProfileId}:${
        nextBlocked ? (change.targetProfileId ?? '') : (change.profileBlockId ?? '')
      }`;
      const request: ActiveRequest = {
        environment,
        generation: environmentGenerationRef?.current,
        existingRecordIds: new Set(environment.getStore().getSource().getRecordIDs()),
        ownerProfileId: change.ownerProfileId,
        token: nextTokenRef.current + 1,
      };
      nextTokenRef.current = request.token;

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
        if (activeRequestsRef.current.has(requestKey)) {
          reject(new Error('Profile block request is already in progress.'));
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
        const finishStale = () => finish(new StaleProfileBlockRequestError());
        const refreshActor = () => {
          if (
            mountedRef.current &&
            currentEnvironmentRef.current === request.environment &&
            environmentGenerationRef?.current === request.generation &&
            selectedProfileIdRef.current === request.ownerProfileId
          ) {
            resetActor(request.ownerProfileId);
          }
        };
        const scheduleRefresh = () => {
          setTimeout(refreshActor, 0);
        };

        try {
          if (nextBlocked) {
            commitBlock({
              onCompleted: (response, errors) => {
                const profileBlock = response.blockProfile?.profileBlock;
                const profileBlockId = profileBlock?.id;
                if (!isCurrent()) {
                  try {
                    discardUnconfirmedProfileBlock(request, profileBlockId);
                  } catch {
                    // The inactive actor store is no longer user-visible.
                  }
                  finishStale();
                  return;
                }
                const error = responseError(errors);
                if (error || !profileBlockId) {
                  try {
                    discardUnconfirmedProfileBlock(request, profileBlockId);
                  } catch (cleanupError) {
                    finish(
                      cleanupError instanceof Error
                        ? cleanupError
                        : new Error(String(cleanupError)),
                    );
                    return;
                  }
                  finish(
                    error ?? new Error('Profile block response did not confirm the relation.'),
                  );
                  return;
                }
                try {
                  environment.commitUpdate((store) => {
                    if (!isCurrent()) {
                      return;
                    }
                    addProfileBlockToStore(store, change.ownerProfileId, profileBlockId);
                    updateProfileBlockStatus(store, change.handle, {
                      blocking: true,
                      profileBlockId,
                    });
                  });
                } catch (commitError) {
                  finish(
                    commitError instanceof Error ? commitError : new Error(String(commitError)),
                  );
                  return;
                }
                finish();
                scheduleRefresh();
              },
              onError: (error) => {
                if (!isCurrent()) {
                  finishStale();
                  return;
                }
                finish(error instanceof Error ? error : new Error(String(error)));
              },
              variables: { id: change.targetProfileId as string },
            });
          } else {
            commitUnblock({
              onCompleted: (response, errors) => {
                if (!isCurrent()) {
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
                try {
                  environment.commitUpdate((store) => {
                    if (!isCurrent()) {
                      return;
                    }
                    removeProfileBlockFromStore(
                      store,
                      change.ownerProfileId,
                      change.profileBlockId as string,
                    );
                    updateProfileBlockStatus(store, change.handle, {
                      blocking: false,
                      profileBlockId: null,
                    });
                  });
                } catch (commitError) {
                  finish(
                    commitError instanceof Error ? commitError : new Error(String(commitError)),
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
              variables: { id: change.profileBlockId as string },
            });
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    [
      commitBlock,
      commitUnblock,
      environment,
      environmentGenerationRef,
      resetActor,
      selectedProfileId,
    ],
  );

  return { changeBlocked };
}
