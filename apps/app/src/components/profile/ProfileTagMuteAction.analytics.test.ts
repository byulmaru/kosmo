import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileTagMuteAction as ProfileTagMuteActionExport } from './ProfileTagMuteAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profileId = 'profile-tag-owner';
const hashtagId = 'hashtag-kosmo';
const ruleId = 'hashtag-rule-kosmo';
const generationRef = { current: 1 };
const analyticsCalls: unknown[][] = [];
const mutationRequests: Array<{
  name: string;
  options: {
    onCompleted: (response: Record<string, unknown>, errors?: ReadonlyArray<unknown>) => void;
    onError: (error: Error) => void;
    variables: unknown;
  };
}> = [];
const toastCalls: unknown[][] = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

let tagData: Record<string, unknown> = {
  id: hashtagId,
  name: 'kosmo',
  viewerMuteRule: { ok: true, value: null },
};

mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: object) => styles },
  View: 'View',
});
mockModule('lucide-react-native', {
  RefreshCw: 'RefreshCw',
  Volume2: 'Volume2',
  VolumeOff: 'VolumeOff',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) =>
    parts.join('').match(/(?:mutation|query|fragment)\s+(\w+)/)?.[1],
  useMutation: (document: string) => [
    (options: (typeof mutationRequests)[number]['options']) => {
      mutationRequests.push({ name: document, options });
    },
    false,
  ],
  useRefetchableFragment: () => [tagData, () => undefined],
});
mockModule('@/analytics/client', {
  trackAnalytics: (...args: unknown[]) => analyticsCalls.push(args),
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: profileId }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: 'primary', foregroundSecondary: 'secondary' }),
});
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: ({ children, ...props }: { children?: unknown }) =>
    createElement('ConfirmationContent', props, children as never),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown }) =>
    createElement('IconButton', props, children as never),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: unknown }) =>
    createElement('ModalSheet', props, children as never),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (...args: unknown[]) => toastCalls.push(args) }),
});

let renderer: ReactTestRenderer | null = null;
let ProfileTagMuteAction: typeof ProfileTagMuteActionExport;

before(async () => {
  ({ ProfileTagMuteAction } = await import('./ProfileTagMuteAction'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  mutationRequests.length = 0;
  analyticsCalls.length = 0;
  toastCalls.length = 0;
  generationRef.current = 1;
  tagData = {
    id: hashtagId,
    name: 'kosmo',
    viewerMuteRule: { ok: true, value: null },
  };
});

async function render() {
  await act(async () => {
    renderer = create(
      createElement(ProfileTagMuteAction, {
        hashtag: {} as never,
      }),
    );
  });
}

function trigger() {
  assert.ok(renderer);
  return renderer.root.findByType('IconButton' as never);
}

function confirmation() {
  assert.ok(renderer);
  return renderer.root.findByType('ConfirmationContent' as never);
}

async function confirm() {
  await act(async () => trigger().props.onPress());
  await act(async () => confirmation().props.onConfirm());
}

test('태그 알림 뮤트 성공은 profile_tag_muted를 정확히 기록한다', async () => {
  await render();
  await confirm();

  assert.equal(mutationRequests[0]?.name, 'ProfileTagMuteActionCreateMutation');
  await act(async () =>
    mutationRequests[0]!.options.onCompleted({
      createHashtagMuteRule: {
        hashtagMuteRule: { id: ruleId, targetHashtag: { id: hashtagId } },
      },
    }),
  );

  assert.deepEqual(analyticsCalls, [['profile_tag_muted', {}]]);
});

test('태그 알림 뮤트 해제 성공은 profile_tag_unmuted를 정확히 기록한다', async () => {
  tagData = {
    id: hashtagId,
    name: 'kosmo',
    viewerMuteRule: {
      ok: true,
      value: {
        appliesTo: 'NOTIFICATION',
        expiresAt: null,
        id: ruleId,
        isActive: true,
        scopes: ['NOTIFICATION'],
      },
    },
  };
  await render();
  await confirm();

  assert.equal(mutationRequests[0]?.name, 'ProfileTagMuteActionDeleteMutation');
  await act(async () =>
    mutationRequests[0]!.options.onCompleted({
      deleteHashtagMuteRule: { hashtagMuteRuleId: ruleId },
    }),
  );

  assert.deepEqual(analyticsCalls, [['profile_tag_unmuted', {}]]);
});

test('태그 뮤트 payload·error와 늦은 generation 응답은 이벤트를 기록하지 않는다', async () => {
  await render();
  await confirm();
  await act(async () =>
    mutationRequests[0]!.options.onCompleted({
      createHashtagMuteRule: { hashtagMuteRule: null },
    }),
  );
  assert.deepEqual(analyticsCalls, []);

  await act(async () => trigger().props.onPress());
  await act(async () => confirmation().props.onConfirm());
  await act(async () =>
    mutationRequests[1]!.options.onCompleted(
      {
        createHashtagMuteRule: {
          hashtagMuteRule: { id: ruleId, targetHashtag: { id: hashtagId } },
        },
      },
      [{ message: 'projection warning' }],
    ),
  );
  assert.deepEqual(analyticsCalls, []);

  await act(async () => trigger().props.onPress());
  await act(async () => confirmation().props.onConfirm());
  generationRef.current += 1;
  await act(async () =>
    mutationRequests[2]!.options.onCompleted({
      createHashtagMuteRule: {
        hashtagMuteRule: { id: ruleId, targetHashtag: { id: hashtagId } },
      },
    }),
  );
  assert.deepEqual(analyticsCalls, []);
});
