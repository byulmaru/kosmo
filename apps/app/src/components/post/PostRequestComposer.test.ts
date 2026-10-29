import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostRequestComposer as PostRequestComposerComponent } from './PostRequestComposer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

type ComposerProps = {
  initialDraft?: {
    bodyText: string;
    contentWarning: string | null;
    media: readonly {
      altText: string | null;
      applyNightshade: boolean;
      mediaId: string;
      mediaState?: 'UPLOADING' | 'READY';
      uri?: string | null;
    }[];
    mentions: readonly { end: number; profileId: string; start: number }[];
    requestId: string;
    sensitiveMedia: boolean;
    visibility: string;
  };
  onPostRequestAccepted?: () => void;
  onPostRequestUncertainChange?: (uncertain: boolean) => void;
  onRequestClose?: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
  beforeEditor?: ReactNode;
  profile?: unknown;
  replyParentId?: string;
  replyParentVisibility?: string;
  repostSourceId?: string;
  children?: ReactNode;
};

let requestData: unknown;
let fragmentData = new Map<unknown, unknown>();
let composerProps: ComposerProps | undefined;
let refetchCalls: Array<{ variables: unknown; options: Record<string, unknown> }> = [];
let renderer: ReactTestRenderer | null = null;
let PostRequestComposer: typeof PostRequestComposerComponent;

mockModule(require.resolve('lucide-react-native'), { ArrowLeftIcon: 'ArrowLeftIcon' });
mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (_fragment: unknown, key: unknown) => fragmentData.get(key) ?? key,
  useRefetchableFragment: () => [
    requestData,
    (variables: unknown, options: Record<string, unknown>) => {
      refetchCalls.push({ options, variables });
      return { dispose: () => undefined };
    },
  ],
});
mockModule('@/components/profile/ProfileNameBlock', { ProfileNameBlock: 'ProfileNameBlock' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/ConfirmationContent', { ConfirmationContent: 'ConfirmationContent' });
mockModule('@/components/ui/IconButton', { IconButton: 'IconButton' });
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ModalSheet', props, children),
});
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금 전' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    borderSubtle: '#subtle',
    foregroundPrimary: '#primary',
    foregroundSecondary: '#secondary',
  }),
});
mockModule('@/theme/tokens', {
  iconSizes: { 20: 20 },
  space: { 8: 8, 12: 12, 16: 16 },
  textStyles: { uiCopyM: {}, uiHeadingS: {} },
});
mockModule(new URL('./PostBody.tsx', import.meta.url), { PostBody: 'PostBody' });
mockModule(new URL('./PostComposerController.tsx', import.meta.url), {
  PostComposerController: (props: ComposerProps) => {
    composerProps = props;
    return createElement('PostComposerController', {}, props.beforeEditor, props.children);
  },
});
mockModule(new URL('./PostSourcePresentationView.tsx', import.meta.url), {
  PostSourcePreview: 'PostSourcePreview',
});
mockModule(new URL('./PostThreadConnector.tsx', import.meta.url), {
  PostThreadConnector: 'PostThreadConnector',
});

before(async () => {
  ({ PostRequestComposer } = await import('./PostRequestComposer'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  requestData = undefined;
  fragmentData = new Map();
  composerProps = undefined;
  refetchCalls = [];
});

function request(status: string, overrides: Record<string, unknown> = {}) {
  return {
    authorProfile: { id: 'profile-author' },
    draft: {
      bodyText: '복원 본문',
      contentWarning: '복원 경고',
      media: [
        {
          altText: '첫 이미지 ALT',
          applyNightshade: true,
          media: { id: 'media-1', state: 'READY', url: 'https://img.example/1.jpg' },
          mediaId: 'media-1',
        },
        {
          altText: '둘째 이미지 ALT',
          applyNightshade: false,
          media: { id: 'media-2', state: 'UPLOADING', url: null },
          mediaId: 'media-2',
        },
        {
          altText: null,
          applyNightshade: true,
          media: null,
          mediaId: 'media-3',
        },
      ],
      mentions: [{ end: 11, profileId: 'profile-mentioned', start: 0 }],
      replyParent: null,
      replyParentId: null,
      repostSource: null,
      repostSourceId: null,
      sensitiveMedia: true,
      visibility: 'DIRECT',
    },
    requestId: 'source-request-id',
    status,
    ...overrides,
  };
}

function mount() {
  act(() => {
    renderer = create(
      createElement(PostRequestComposer, {
        onBack: () => undefined,
        request: {} as never,
      }),
    );
  });
}

function readComposerProps(): ComposerProps | undefined {
  return composerProps;
}

function pressButton(label: string) {
  const button = renderer?.root
    .findAllByType('Button' as ElementType)
    .find((node) => node.props.children === label);
  assert.ok(button, `Expected button ${label}`);
  act(() => button.props.onPress?.());
}

test('failed and cancelled requests can restore the snapshot into a fresh composer', async () => {
  for (const status of ['FAILED', 'CANCELLED']) {
    requestData = request(status);
    composerProps = undefined;
    await act(async () => {
      renderer = create(
        createElement(PostRequestComposer, {
          onBack: () => undefined,
          request: {} as never,
        }),
      );
    });

    pressButton('다시 작성');

    const restoredProps = readComposerProps();
    assert.ok(restoredProps);
    assert.deepEqual(restoredProps.initialDraft, {
      bodyText: '복원 본문',
      contentWarning: '복원 경고',
      media: [
        {
          altText: '첫 이미지 ALT',
          applyNightshade: true,
          mediaId: 'media-1',
          mediaState: 'READY',
          uri: 'https://img.example/1.jpg',
        },
        {
          altText: '둘째 이미지 ALT',
          applyNightshade: false,
          mediaId: 'media-2',
          mediaState: 'UPLOADING',
          uri: null,
        },
        { altText: null, applyNightshade: true, mediaId: 'media-3' },
      ],
      mentions: [{ end: 11, profileId: 'profile-mentioned', start: 0 }],
      requestId: 'source-request-id',
      sensitiveMedia: true,
      visibility: 'DIRECT',
    });
    assert.equal(restoredProps.profile, (requestData as { authorProfile: unknown }).authorProfile);
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

test('restored reply keeps its relation and the original visibility', async () => {
  const replyParentKey = {};
  const replyParent = {
    createdAt: '2026-10-29T00:00:00.000Z',
    id: 'post-parent',
    profile: {
      avatar: null,
      displayName: 'Parent',
      handle: 'parent',
      relativeHandle: '@parent',
    },
    repostSource: null,
    visibility: 'FOLLOWERS',
  };
  fragmentData.set(replyParentKey, replyParent);
  requestData = request('FAILED', {
    draft: {
      ...(request('FAILED') as { draft: object }).draft,
      replyParent: replyParentKey,
      replyParentId: 'post-parent-id',
    },
  });
  mount();

  pressButton('다시 작성');

  const restoredProps = readComposerProps();
  assert.ok(restoredProps);
  assert.equal(restoredProps.replyParentId, 'post-parent-id');
  assert.equal(restoredProps.replyParentVisibility, 'FOLLOWERS');
  assert.equal(restoredProps.repostSourceId, undefined);
  assert.ok(restoredProps.beforeEditor);
  assert.equal(renderer?.root.findByType('PostBody' as ElementType).props.post, replyParent);
});

test('missing reply context blocks restoration and refetches the same request from the network', async () => {
  requestData = request('FAILED', {
    draft: {
      ...(request('FAILED') as { draft: object }).draft,
      replyParentId: 'missing-parent-id',
    },
  });
  mount();

  assert.equal(
    renderer?.root.findAllByProps({ accessibilityRole: 'alert' })[0]?.props.children,
    '답글 대상을 불러올 수 없어요.',
  );
  pressButton('다시 확인');

  assert.deepEqual(refetchCalls[0]?.variables, {});
  assert.equal(refetchCalls[0]?.options.fetchPolicy, 'network-only');
  assert.equal(renderer?.root.findAllByProps({ children: '다시 작성' }).length, 0);
});

test('an uncertain submission lets the user confirm closing', async () => {
  let backCount = 0;
  requestData = request('CANCELLED');
  await act(async () => {
    renderer = create(
      createElement(PostRequestComposer, {
        onBack: () => {
          backCount += 1;
        },
        request: {} as never,
      }),
    );
  });
  pressButton('다시 작성');
  act(() => readComposerProps()?.onPostRequestUncertainChange?.(true));

  const backButton = renderer?.root.findByProps({ accessibilityLabel: '뒤로' });
  assert.ok(backButton);
  act(() => backButton.props.onPress?.());

  const dialog = renderer?.root.findByType('ModalSheet' as ElementType);
  assert.equal(dialog?.props.visible, true);
  const confirmation = renderer?.root.findByType('ConfirmationContent' as ElementType);
  assert.equal(
    confirmation?.props.message,
    '접수 결과를 확인하지 못했어요. 닫아도 게시될 수 있어요.',
  );
  assert.equal(backCount, 0);
  act(() => readComposerProps()?.onSubmittingChange?.(true));
  act(() => backButton.props.onPress?.());
  assert.equal(dialog?.props.visible, false);
  assert.equal(backCount, 0);
  act(() => readComposerProps()?.onSubmittingChange?.(false));
  act(() => readComposerProps()?.onPostRequestUncertainChange?.(true));
  act(() => backButton.props.onPress?.());
  act(() => confirmation?.props.onConfirm());
  assert.equal(backCount, 1);
});

test('restored quote keeps its source relation', async () => {
  const repostSourceKey = {};
  requestData = request('FAILED', {
    draft: {
      ...(request('FAILED') as { draft: object }).draft,
      repostSource: repostSourceKey,
      repostSourceId: 'post-source-id',
    },
  });
  mount();

  pressButton('다시 작성');

  const restoredProps = readComposerProps();
  assert.ok(restoredProps);
  assert.equal(restoredProps.repostSourceId, 'post-source-id');
  assert.equal(restoredProps.replyParentId, undefined);
  assert.ok(restoredProps.children);
  assert.equal(
    renderer?.root.findByType('PostSourcePreview' as ElementType).props.source,
    repostSourceKey,
  );
});

test('missing author and missing quote source both block restoration', async () => {
  requestData = request('CANCELLED', { authorProfile: null });
  mount();
  assert.equal(
    renderer?.root.findAllByProps({ accessibilityRole: 'alert' })[0]?.props.children,
    '작성 프로필을 불러올 수 없어요.',
  );
  pressButton('다시 확인');
  assert.equal(refetchCalls[0]?.options.fetchPolicy, 'network-only');
  await act(async () => renderer?.unmount());
  renderer = null;

  requestData = request('FAILED', {
    draft: {
      ...(request('FAILED') as { draft: object }).draft,
      repostSourceId: 'missing-source-id',
    },
  });
  mount();
  assert.equal(
    renderer?.root.findAllByProps({ accessibilityRole: 'alert' })[0]?.props.children,
    '인용 게시글을 불러올 수 없어요.',
  );
  pressButton('다시 확인');
  assert.equal(refetchCalls[1]?.options.fetchPolicy, 'network-only');
});

test('requests still processing cannot open a restored composer', () => {
  requestData = request('PROCESSING');
  mount();

  assert.equal(composerProps, undefined);
  assert.equal(renderer?.root.findAllByType('Button' as ElementType).length, 0);
});

test('accepted submission returns to request detail after the controller acknowledgement', async () => {
  let backCount = 0;
  requestData = request('FAILED');
  await act(async () => {
    renderer = create(
      createElement(PostRequestComposer, {
        onBack: () => {
          backCount += 1;
        },
        request: {} as never,
      }),
    );
  });

  pressButton('다시 작성');
  act(() => readComposerProps()?.onPostRequestAccepted?.());

  assert.equal(backCount, 1);
});

test('back confirms closing the restored draft', async () => {
  let backCount = 0;
  requestData = request('FAILED');
  await act(async () => {
    renderer = create(
      createElement(PostRequestComposer, {
        onBack: () => {
          backCount += 1;
        },
        request: {} as never,
      }),
    );
  });

  pressButton('다시 작성');
  const backButton = renderer?.root.findByProps({ accessibilityLabel: '뒤로' });
  assert.ok(backButton);
  act(() => backButton.props.onPress?.());

  const confirmation = renderer?.root.findByType('ConfirmationContent' as ElementType);
  assert.equal(confirmation?.props.message, '작성 중인 내용을 닫을까요?');
  assert.equal(backCount, 0);
  act(() => confirmation?.props.onConfirm());
  assert.equal(backCount, 1);
});
