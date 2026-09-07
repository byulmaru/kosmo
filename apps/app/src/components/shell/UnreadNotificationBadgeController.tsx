import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { graphql, useRelayEnvironment } from 'react-relay';
import { createOperationDescriptor, fetchQuery, getRequest } from 'relay-runtime';
import { useSession } from '@/session/SessionProvider';
import {
  getUnreadNotificationCountForProfile,
  getVisibleUnreadNotificationCount,
} from './unreadNotificationBadgeState';
import type { PropsWithChildren } from 'react';
import type { UnreadNotificationBadgeControllerQuery } from './__generated__/UnreadNotificationBadgeControllerQuery.graphql';
import type { UnreadNotificationBadgeLastSuccess } from './unreadNotificationBadgeState';

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

type UnreadNotificationBadgeStateContextValue = {
  lastSuccess: UnreadNotificationBadgeLastSuccess | null;
  recordSuccess: (profileId: string, count: number) => void;
};

const UnreadNotificationBadgeStateContext =
  createContext<UnreadNotificationBadgeStateContextValue | null>(null);
const UnreadNotificationCountContext = createContext<number | null>(null);

export function UnreadNotificationBadgeStateProvider({ children }: PropsWithChildren) {
  const [lastSuccess, setLastSuccess] = useState<UnreadNotificationBadgeLastSuccess | null>(null);
  const recordSuccess = (profileId: string, count: number) => {
    setLastSuccess({ profileId, count });
  };

  return (
    <UnreadNotificationBadgeStateContext.Provider value={{ lastSuccess, recordSuccess }}>
      {children}
    </UnreadNotificationBadgeStateContext.Provider>
  );
}

function useUnreadNotificationBadgeState(): UnreadNotificationBadgeStateContextValue {
  const state = useContext(UnreadNotificationBadgeStateContext);
  if (!state) {
    throw new Error('UnreadNotificationBadgeStateProvider is required.');
  }
  return state;
}

export function UnreadNotificationBadgeController({ children }: PropsWithChildren) {
  const environment = useRelayEnvironment();
  const { selectedProfileId } = useSession();
  const selectedProfileRef = useRef(selectedProfileId);
  const { lastSuccess, recordSuccess } = useUnreadNotificationBadgeState();

  selectedProfileRef.current = selectedProfileId;

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
        recordSuccess(selectedProfileId, count);
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
      error: () => undefined,
    });

    return () => {
      request.unsubscribe();
      subscription.dispose();
      retain.dispose();
    };
  }, [environment, selectedProfileId]);

  const count = getVisibleUnreadNotificationCount(lastSuccess, selectedProfileId);

  return (
    <UnreadNotificationCountContext.Provider value={count}>
      {children}
    </UnreadNotificationCountContext.Provider>
  );
}

export function useUnreadNotificationCount(): number | null {
  return useContext(UnreadNotificationCountContext);
}
