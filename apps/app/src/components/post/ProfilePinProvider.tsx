import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { graphql, useLazyLoadQuery, useMutation } from 'react-relay';
import { RelayFailOpenBoundary } from '@/components/RelayFailOpenBoundary';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { PropsWithChildren } from 'react';
import type { ProfilePinProviderPinProfilePostMutation } from './__generated__/ProfilePinProviderPinProfilePostMutation.graphql';
import type { ProfilePinProviderQuery as ProfilePinProviderQueryType } from './__generated__/ProfilePinProviderQuery.graphql';
import type { ProfilePinProviderUnpinProfilePostMutation } from './__generated__/ProfilePinProviderUnpinProfilePostMutation.graphql';

const ProfilePinProviderQuery = graphql`
  query ProfilePinProviderQuery($profileId: ID!) {
    node(id: $profileId) {
      __typename
      ... on Profile {
        id
        relativeHandle
        pinnedPosts(first: 20) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  }
`;

const pinMutation = graphql`
  mutation ProfilePinProviderPinProfilePostMutation($postId: ID!) {
    pinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const unpinMutation = graphql`
  mutation ProfilePinProviderUnpinProfilePostMutation($postId: ID!) {
    unpinProfilePost(input: { postId: $postId }) {
      changed
      profile {
        id
        pinnedPosts(first: 20) @connection(key: "PostList_profile__pinnedPosts") {
          edges {
            node {
              id
              ...PostListItem_post
            }
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
      }
    }
  }
`;

const failureMessage = '고정 상태를 변경하지 못했어요. 다시 시도해 주세요.';
const replacementFailureMessage =
  '기존 고정은 해제됐지만 새 게시글을 고정하지 못했어요. 다시 시도해 주세요.';

type ProfilePinMutationPayload =
  | ProfilePinProviderPinProfilePostMutation['response']['pinProfilePost']
  | ProfilePinProviderUnpinProfilePostMutation['response']['unpinProfilePost'];

type ProfilePinRequest =
  | { kind: 'pin'; postId: string }
  | { kind: 'replace'; existingPostId: string; postId: string }
  | { kind: 'unpin'; onCompleted?: () => void; postId: string };

type ProfilePinContextValue = Readonly<{
  available: boolean;
  firstPinnedPostId: string | null;
  pending: boolean;
  queryFailed: boolean;
  request: (request: ProfilePinRequest) => void;
  retry: () => void;
}>;

const unavailableValue: ProfilePinContextValue = {
  available: false,
  firstPinnedPostId: null,
  pending: false,
  queryFailed: false,
  request: () => undefined,
  retry: () => undefined,
};

const ProfilePinContext = createContext<ProfilePinContextValue>(unavailableValue);

export function ProfilePinProvider({ children }: PropsWithChildren) {
  const { selectedProfileId } = useSession();
  const [retryKey, setRetryKey] = useState(0);
  const retry = useCallback(() => {
    setRetryKey((current) => current + 1);
  }, []);
  const fallbackValue = useMemo<ProfilePinContextValue>(
    () => ({ ...unavailableValue, queryFailed: true, retry }),
    [retry],
  );

  if (!selectedProfileId) {
    return (
      <ProfilePinContext.Provider value={unavailableValue}>{children}</ProfilePinContext.Provider>
    );
  }

  const fallback = (
    <ProfilePinContext.Provider value={fallbackValue}>{children}</ProfilePinContext.Provider>
  );
  return (
    <RelayFailOpenBoundary fallback={fallback} resetKey={retryKey}>
      <ProfilePinProviderContent
        key={selectedProfileId}
        fetchKey={retryKey}
        profileId={selectedProfileId}
      >
        {children}
      </ProfilePinProviderContent>
    </RelayFailOpenBoundary>
  );
}

function ProfilePinProviderContent({
  children,
  profileId,
  fetchKey,
}: PropsWithChildren<{ fetchKey: number; profileId: string }>) {
  const data = useLazyLoadQuery<ProfilePinProviderQueryType>(
    ProfilePinProviderQuery,
    { profileId },
    { fetchKey, fetchPolicy: 'store-or-network' },
  );
  const [commitPin, isPinning] = useMutation<ProfilePinProviderPinProfilePostMutation>(pinMutation);
  const [commitUnpin, isUnpinning] =
    useMutation<ProfilePinProviderUnpinProfilePostMutation>(unpinMutation);
  const { showToast } = useToast();

  const firstPinnedPostId =
    data.node?.__typename === 'Profile'
      ? (data.node.pinnedPosts.edges.find((edge) => edge.node != null)?.node?.id ?? null)
      : null;
  const available = data.node?.__typename === 'Profile' && data.node.id === profileId;
  const pending = isPinning || isUnpinning;
  const showFailure = useCallback(
    (relativeHandle: string, message: string) => {
      showToast(`${relativeHandle}의 ${message}`, { tone: 'danger' });
    },
    [showToast],
  );

  const request = useCallback(
    (operation: ProfilePinRequest) => {
      if (pending || data.node?.__typename !== 'Profile' || data.node.id !== profileId) {
        return;
      }
      const requestProfileHandle = data.node.relativeHandle;

      const commitPinRequest = (postId: string, errorMessage: string) => {
        commitPin({
          onCompleted: (response) => {
            if (!isDurableProfilePinResult(response.pinProfilePost, profileId)) {
              showFailure(requestProfileHandle, errorMessage);
            }
          },
          onError: () => showFailure(requestProfileHandle, errorMessage),
          variables: { postId },
        });
      };

      if (operation.kind === 'unpin') {
        commitUnpin({
          onCompleted: (response) => {
            if (!isDurableProfilePinResult(response.unpinProfilePost, profileId)) {
              showFailure(requestProfileHandle, failureMessage);
              return;
            }
            operation.onCompleted?.();
          },
          onError: () => showFailure(requestProfileHandle, failureMessage),
          variables: { postId: operation.postId },
        });
        return;
      }

      if (operation.kind === 'replace') {
        commitUnpin({
          onCompleted: (response) => {
            if (!isDurableProfilePinResult(response.unpinProfilePost, profileId)) {
              showFailure(requestProfileHandle, failureMessage);
              return;
            }
            commitPinRequest(operation.postId, replacementFailureMessage);
          },
          onError: () => showFailure(requestProfileHandle, failureMessage),
          variables: { postId: operation.existingPostId },
        });
        return;
      }

      commitPinRequest(operation.postId, failureMessage);
    },
    [commitPin, commitUnpin, data.node, pending, profileId, showFailure],
  );

  const value = useMemo<ProfilePinContextValue>(
    () => ({
      available,
      firstPinnedPostId,
      pending,
      queryFailed: false,
      request,
      retry: unavailableValue.retry,
    }),
    [available, firstPinnedPostId, pending, request],
  );

  return <ProfilePinContext.Provider value={value}>{children}</ProfilePinContext.Provider>;
}

function isDurableProfilePinResult(
  result: ProfilePinMutationPayload | null | undefined,
  profileId: string,
) {
  return typeof result?.changed === 'boolean' && result.profile?.id === profileId;
}

export function useProfilePin() {
  return useContext(ProfilePinContext);
}
