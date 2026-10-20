import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowRequestListItem as FollowRequestListItemExport } from './FollowRequestListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profileId = 'profile-follow-request-owner';
const requestId = 'follow-request-active';
const followerId = 'profile-follow-requester';
const connectionId = 'client:follow-request-connection';
const generationRef = { current: 1 };
const analyticsCalls: unknown[][] = [];
const toastCalls: unknown[][] = [];
const requests: Array<{
  name: string;
  options: {
    onCompleted: (response: Record<string, unknown>, errors?: ReadonlyArray<unknown>) => void;
    onError: (error: Error) => void;
    variables: unknown;
  };
}> = [];
const fragmentData = {
  follower: {
    displayName: '요청자',
    handle: 'requester',
    id: followerId,
    relativeHandle: '@requester',
  },
  id: requestId,
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    return parts.join('').match(/(?:mutation|fragment)\s+(\w+)/)?.[1];
  },
  useFragment: () => fragmentData,
  useMutation: (document: string) => [
    (options: (typeof requests)[number]['options']) => {
      requests.push({ name: document, options });
    },
    false,
  ],
});
mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' },
  StyleSheet: { create: (styles: object) => styles },
  View: 'View',
});
mockModule('lucide-react-native', { CheckIcon: 'CheckIcon', XIcon: 'XIcon' });
mockModule('@/analytics/client', {
  trackAnalytics: (...args: unknown[]) => analyticsCalls.push(args),
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule('@/components/profile/ProfileListItemContent', {
  ProfileListItemContent: ({ children, ...props }: { children?: unknown }) =>
    createElement('ProfileListItemContent', props, children as never),
});
mockModule('@/components/profile/ProfileListItemRow', {
  ProfileListItemRow: ({ children, ...props }: { children?: unknown }) =>
    createElement('ProfileListItemRow', props, children as never),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown }) =>
    createElement('IconButton', props, children as never),
});
mockModule('@/components/ui/interactionTarget', { getInteractionTargetSize: () => 32 });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({
    showToast: (...args: unknown[]) => toastCalls.push(args),
  }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: 'primary', stateDisabledForeground: 'disabled' }),
});

let renderer: ReactTestRenderer | null = null;
let FollowRequestListItem: typeof FollowRequestListItemExport;

before(async () => {
  ({ FollowRequestListItem } = await import('./FollowRequestListItem'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests.length = 0;
  analyticsCalls.length = 0;
  toastCalls.length = 0;
  generationRef.current = 1;
});

async function render() {
  await act(async () => {
    renderer = create(
      createElement(FollowRequestListItem, {
        connectionId,
        request: {} as never,
      }),
    );
  });
}

function buttons() {
  assert.ok(renderer);
  return renderer.root.findAllByType('IconButton' as never);
}

async function respond(
  index: number,
  payload: Record<string, unknown>,
  errors?: ReadonlyArray<unknown>,
) {
  await act(async () => {
    requests[index]!.options.onCompleted(payload, errors);
  });
}

function approvePayload() {
  return {
    approveProfileFollowRequest: {
      followerProfile: { followingCount: 2, id: followerId },
      followeeProfile: { followersCount: 3, id: profileId },
      profileFollow: {
        follower: { id: followerId },
        followee: { id: profileId },
        id: 'profile-follow-created',
      },
      profileFollowRequestId: requestId,
    },
  };
}

function rejectPayload() {
  return {
    rejectProfileFollowRequest: {
      followeeProfile: { id: profileId },
      profileFollowRequestId: requestId,
    },
  };
}

test('팔로우 요청 승인 성공은 accepted 이벤트를 정확히 기록한다', async () => {
  await render();
  await act(async () => buttons()[0]!.props.onPress());
  assert.equal(requests[0]?.name, 'FollowRequestListItemApproveMutation');
  await respond(0, approvePayload());

  assert.deepEqual(analyticsCalls, [['follow_request_responded', { result: 'accepted' }]]);
});

test('팔로우 요청 거절 성공은 rejected 이벤트를 정확히 기록한다', async () => {
  await render();
  await act(async () => buttons()[1]!.props.onPress());
  assert.equal(requests[0]?.name, 'FollowRequestListItemRejectMutation');
  await respond(0, rejectPayload());

  assert.deepEqual(analyticsCalls, [['follow_request_responded', { result: 'rejected' }]]);
});

test('팔로우 요청 payload 누락과 늦은 generation 응답은 이벤트를 기록하지 않는다', async () => {
  await render();
  await act(async () => buttons()[0]!.props.onPress());
  await respond(0, { approveProfileFollowRequest: null });
  assert.deepEqual(analyticsCalls, []);
  assert.deepEqual(toastCalls, []);

  await act(async () => buttons()[0]!.props.onPress());
  generationRef.current += 1;
  await respond(1, approvePayload());
  assert.deepEqual(analyticsCalls, []);
});
