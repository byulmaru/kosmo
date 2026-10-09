import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { graphql, useMutation, useRelayEnvironment } from 'react-relay';
import { QueryRenderer } from 'react-relay/legacy';
import { useToast } from '@/components/ui/ToastProvider';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
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
  const environment = useRelayEnvironment();
  return (
    <QueryRenderer<ProfilePinProviderQueryType>
      environment={environment}
      fetchPolicy="store-or-network"
      query={selectedProfileId ? ProfilePinProviderQuery : null}
      variables={{ profileId: selectedProfileId ?? '' }}
      render={({ error, props, retry }) => (
        <ProfilePinProviderContent
          data={selectedProfileId ? props : null}
          error={error}
          profileId={selectedProfileId}
          retry={retry}
        >
          {children}
        </ProfilePinProviderContent>
      )}
    />
  );
}

function ProfilePinProviderContent({
  data,
  children,
  error,
  profileId,
  retry,
}: PropsWithChildren<{
  data: ProfilePinProviderQueryType['response'] | null;
  error: Error | null;
  profileId: string | null;
  retry: (() => void) | null;
}>) {
  const [commitPin, isPinning] = useMutation<ProfilePinProviderPinProfilePostMutation>(pinMutation);
  const [commitUnpin, isUnpinning] =
    useMutation<ProfilePinProviderUnpinProfilePostMutation>(unpinMutation);
  const { showToast } = useToast();
  const reportUnexpectedError = useUnexpectedErrorReporter();

  useEffect(() => {
    if (error) {
      reportUnexpectedError?.(error, { componentStack: '' });
    }
  }, [error, reportUnexpectedError]);

  const profile = data?.node?.__typename === 'Profile' ? data.node : null;
  const firstPinnedPostId =
    profile?.pinnedPosts.edges.find((edge) => edge.node != null)?.node?.id ?? null;
  const available = profileId !== null && profile?.id === profileId;
  const pending = isPinning || isUnpinning;
  const showFailure = useCallback(
    (relativeHandle: string, message: string) => {
      showToast(`${relativeHandle}의 ${message}`, { tone: 'danger' });
    },
    [showToast],
  );

  const request = useCallback(
    (operation: ProfilePinRequest) => {
      if (pending || profileId === null || profile === null || profile.id !== profileId) {
        return;
      }
      const requestProfileHandle = profile.relativeHandle;

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
    [commitPin, commitUnpin, pending, profile, profileId, showFailure],
  );

  const value = useMemo<ProfilePinContextValue>(
    () => ({
      available,
      firstPinnedPostId,
      pending,
      queryFailed: error !== null,
      request,
      retry: retry ?? unavailableValue.retry,
    }),
    [available, error, firstPinnedPostId, pending, request, retry],
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
