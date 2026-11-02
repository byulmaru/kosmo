import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PostRequestPreviewProvider as PostRequestPreviewProviderComponent,
  PostRequestPreviewStore,
  usePostRequestPreview as UsePostRequestPreview,
  usePostRequestPreviewStore as UsePostRequestPreviewStore,
} from './PostRequestPreviewContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

type TestSession = {
  accountId: string | null;
  selectedProfileId: string | null;
  sessionId: string | null;
};
let sessionState: TestSession = {
  accountId: 'account-a',
  selectedProfileId: 'profile-a',
  sessionId: 'session-a',
};
let authLifecycleKey = 'auth:0';
let releasedPreviewUris: string[] = [];
let currentPreview: { mediaId: string; uri: string } | undefined;
let currentStore: PostRequestPreviewStore | undefined;
let renderer: ReactTestRenderer | null = null;

mockModule('@/components/media/imageUpload', {
  releaseImagePreview: (uri: string) => releasedPreviewUris.push(uri),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
});
mockModule('@/relay/RelayActorProvider', {
  useRelayAuthLifecycleKey: () => authLifecycleKey,
});
mockModule('@/session/SessionProvider', {
  useSession: () => sessionState,
});

let PostRequestPreviewProvider: typeof PostRequestPreviewProviderComponent;
let usePostRequestPreview: typeof UsePostRequestPreview;
let usePostRequestPreviewStore: typeof UsePostRequestPreviewStore;

before(async () => {
  ({ PostRequestPreviewProvider, usePostRequestPreview, usePostRequestPreviewStore } =
    await import('./PostRequestPreviewContext'));
});

beforeEach(() => {
  sessionState = {
    accountId: 'account-a',
    selectedProfileId: 'profile-a',
    sessionId: 'session-a',
  };
  authLifecycleKey = 'auth:0';
  releasedPreviewUris = [];
  currentPreview = undefined;
  currentStore = undefined;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

function PreviewReader() {
  currentStore = usePostRequestPreviewStore();
  currentPreview = usePostRequestPreview('request-1');
  return null;
}

const previewTree = () =>
  createElement(PostRequestPreviewProvider, null, createElement(PreviewReader));

it('keeps previews through Profile switches and clears their Blob URLs when the session scope ends', async () => {
  await act(async () => {
    renderer = create(previewTree());
  });

  const profileStore = currentStore;
  assert.ok(profileStore);
  assert.equal(currentPreview, undefined);

  await act(async () => {
    profileStore.set('request-1', { mediaId: 'media-1', uri: 'blob:profile-preview' });
  });
  assert.deepEqual(currentPreview, { mediaId: 'media-1', uri: 'blob:profile-preview' });

  sessionState.selectedProfileId = 'profile-b';
  await act(async () => {
    renderer?.update(previewTree());
  });
  assert.equal(currentStore, profileStore);
  assert.equal(currentStore?.get('request-1')?.mediaId, 'media-1');

  sessionState.sessionId = 'session-b';
  await act(async () => {
    renderer?.update(previewTree());
  });
  const nextSessionStore = currentStore;
  assert.notEqual(nextSessionStore, profileStore);
  assert.equal(profileStore.get('request-1'), undefined);
  assert.deepEqual(releasedPreviewUris, ['blob:profile-preview']);

  await act(async () => {
    nextSessionStore?.set('request-2', { mediaId: 'media-2', uri: 'blob:account-preview' });
  });
  sessionState.accountId = 'account-b';
  await act(async () => {
    renderer?.update(previewTree());
  });
  const nextAccountStore = currentStore;
  assert.notEqual(nextAccountStore, nextSessionStore);
  assert.equal(nextSessionStore?.get('request-2'), undefined);
  assert.deepEqual(releasedPreviewUris, ['blob:profile-preview', 'blob:account-preview']);

  await act(async () => {
    nextAccountStore?.set('request-3', { mediaId: 'media-3', uri: 'blob:logout-preview' });
  });
  sessionState.accountId = null;
  sessionState.sessionId = null;
  await act(async () => {
    renderer?.update(previewTree());
  });
  const guestStore = currentStore;
  assert.notEqual(guestStore, nextAccountStore);
  assert.equal(nextAccountStore?.get('request-3'), undefined);
  assert.deepEqual(releasedPreviewUris, [
    'blob:profile-preview',
    'blob:account-preview',
    'blob:logout-preview',
  ]);

  await act(async () => {
    guestStore?.set('request-4', { mediaId: 'media-4', uri: 'blob:auth-preview' });
  });
  authLifecycleKey = 'auth:1';
  await act(async () => {
    renderer?.update(previewTree());
  });
  const nextAuthStore = currentStore;
  assert.notEqual(nextAuthStore, guestStore);
  assert.equal(guestStore?.get('request-4'), undefined);
  assert.deepEqual(releasedPreviewUris, [
    'blob:profile-preview',
    'blob:account-preview',
    'blob:logout-preview',
    'blob:auth-preview',
  ]);

  nextAuthStore?.set('request-5', { mediaId: 'media-5', uri: 'blob:after-reset' });
  assert.equal(nextAuthStore?.get('request-5')?.mediaId, 'media-5');
});
