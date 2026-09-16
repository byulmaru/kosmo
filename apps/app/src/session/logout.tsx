import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { clearAnalytics } from '@/analytics/client';
import { LOGOUT_FAILURE_MESSAGE, requestWebLogout } from '@/auth/logout';
import { useRelayActor } from '@/relay/RelayActorProvider';
import type { LogoutRevokeCurrentSessionMutation as LogoutRevokeCurrentSessionMutationType } from './__generated__/LogoutRevokeCurrentSessionMutation.graphql';

const RevokeCurrentSessionMutation = graphql`
  mutation LogoutRevokeCurrentSessionMutation {
    revokeCurrentSession {
      completed
    }
  }
`;

export type LogoutState = {
  error: string | null;
  logout: () => void;
  pending: boolean;
};

/**
 * Logs out the current Session and clears the local viewer state.
 *
 * Account deletion uses `useAccountDeletionCleanup` after the server has already revoked every
 * Session. Keeping that path separate prevents a second native revoke against the revoked current
 * Session while still allowing Web to clear its HttpOnly cookie through the idempotent BFF route.
 */
export function useLogout(): LogoutState {
  return useLogoutLifecycle({ shouldRevokeNativeSession: true });
}

/**
 * Clears the local credential/viewer state and returns to login after a server-confirmed Account
 * deletion. Web clears its HttpOnly cookie through the idempotent BFF logout route; Native skips a
 * second server revoke and only clears its local credential.
 */
export function useAccountDeletionCleanup(): LogoutState {
  return useLogoutLifecycle({ shouldRevokeNativeSession: false });
}

function useLogoutLifecycle({
  shouldRevokeNativeSession,
}: {
  shouldRevokeNativeSession: boolean;
}): LogoutState {
  const router = useRouter();
  const { clearNativeSession, resetActor } = useRelayActor();
  const [commitNativeLogout] = useMutation<LogoutRevokeCurrentSessionMutationType>(
    RevokeCurrentSessionMutation,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const revokeNativeSession = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        commitNativeLogout({
          variables: {},
          onCompleted: (response, errors) => {
            if (errors?.length || !response.revokeCurrentSession.completed) {
              reject(new Error(LOGOUT_FAILURE_MESSAGE));
              return;
            }

            resolve();
          },
          onError: reject,
        });
      }),
    [commitNativeLogout],
  );

  const logout = useCallback(() => {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setError(null);
    setPending(true);

    void (async () => {
      try {
        if (Platform.OS === 'web') {
          await requestWebLogout();
          resetActor(null);
          clearAnalytics();
        } else {
          if (shouldRevokeNativeSession) {
            await revokeNativeSession();
          }
          await clearNativeSession();
        }

        router.replace('/');
        setPending(false);
      } catch {
        setPending(false);
        setError(LOGOUT_FAILURE_MESSAGE);
      } finally {
        inFlight.current = false;
      }
    })();
  }, [clearNativeSession, resetActor, revokeNativeSession, router, shouldRevokeNativeSession]);

  return { error, logout, pending };
}
