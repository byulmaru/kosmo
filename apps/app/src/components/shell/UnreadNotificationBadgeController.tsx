import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { createOperationDescriptor, fetchQuery, getRequest } from 'relay-runtime';
import { useSession } from '@/session/SessionProvider';
import {
  getUnreadNotificationCountForProfile,
  getVisibleUnreadNotificationCount,
  reduceUnreadNotificationBadgeState,
} from './unreadNotificationBadgeState';
import type { PropsWithChildren } from 'react';
import type { UnreadNotificationBadgeControllerQuery } from './__generated__/UnreadNotificationBadgeControllerQuery.graphql';

const UnreadNotificationBadgeControllerQuery = graphql`
  query UnreadNotificationBadgeControllerQuery($id: ID!) {
    node(id: $id) {
      ... on Profile {
        id
        unreadNotificationCount
      }
    }
  }
`;

const UnreadNotificationCountContext = createContext<number | null>(null);

export function UnreadNotificationBadgeController({ children }: PropsWithChildren) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const selectedProfileRef = useRef(selectedProfileId);
  const [state, dispatch] = useReducer(reduceUnreadNotificationBadgeState, {
    activeProfileId: selectedProfileId,
    lastSuccessCount: null,
  });

  selectedProfileRef.current = selectedProfileId;

  useEffect(() => {
    dispatch({ type: 'select', profileId: selectedProfileId });
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) {
      return;
    }

    const variables = { id: selectedProfileId };
    const operation = createOperationDescriptor(
      getRequest(UnreadNotificationBadgeControllerQuery),
      variables,
    );
    const retain = environment.retain(operation);
    const updateCount = (snapshot: ReturnType<typeof environment.lookup>) => {
      const node = (snapshot.data as UnreadNotificationBadgeControllerQuery['response']).node;
      const count = getUnreadNotificationCountForProfile(node, selectedProfileId);

      if (selectedProfileRef.current === selectedProfileId && count !== null) {
        dispatch({
          type: 'success',
          profileId: selectedProfileId,
          count,
        });
      }
    };
    const snapshot = environment.lookup(operation.fragment);
    updateCount(snapshot);
    const subscription = environment.subscribe(snapshot, updateCount);
    const request = fetchQuery<UnreadNotificationBadgeControllerQuery>(
      environment,
      UnreadNotificationBadgeControllerQuery,
      variables,
      { fetchPolicy: 'network-only' },
    ).subscribe({
      error: () => {
        if (selectedProfileRef.current === selectedProfileId) {
          dispatch({ type: 'error', profileId: selectedProfileId });
        }
      },
    });

    return () => {
      request.unsubscribe();
      subscription.dispose();
      retain.dispose();
    };
  }, [environment, selectedProfileId]);

  const count = getVisibleUnreadNotificationCount(state, selectedProfileId);

  return (
    <UnreadNotificationCountContext.Provider value={count}>
      {children}
    </UnreadNotificationCountContext.Provider>
  );
}

export function useUnreadNotificationCount(): number | null {
  return useContext(UnreadNotificationCountContext);
}
