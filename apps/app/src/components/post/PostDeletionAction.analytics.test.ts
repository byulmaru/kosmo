import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostDeletionAction as PostDeletionActionExport } from './PostDeletionAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const postId = 'post-author-owned';
const profileId = 'profile-author';
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
const relayEnvironment = {};
const postData = {
  content: { id: `${postId}:content` },
  id: postId,
  profile: { id: profileId },
  state: 'ACTIVE',
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    return parts.join('').match(/(?:mutation|fragment)\s+(\w+)/)?.[1];
  },
  useFragment: () => postData,
  useMutation: (document: string) => [
    (options: (typeof requests)[number]['options']) => {
      requests.push({ name: document, options });
    },
    false,
  ],
  useRelayEnvironment: () => relayEnvironment,
});
mockModule('react-native', { View: 'View' });
const require = createRequire(import.meta.url);
const icons = { MoreHorizontal: 'MoreHorizontal', Trash2: 'Trash2' };
mockModule('lucide-react-native', icons);
mockModule(require.resolve('lucide-react-native'), icons);
mockModule('@/analytics/client', {
  trackAnalytics: (...args: unknown[]) => analyticsCalls.push(args),
});
mockModule('@/components/ui/ActionMenu', {
  ActionMenu: ({
    items,
    renderTrigger,
  }: {
    items: unknown[];
    renderTrigger: (props: {
      expanded: boolean;
      focusTrigger: () => void;
      onPress: () => void;
      ref: { current: null };
    }) => ReactNode;
  }) =>
    createElement(
      'ActionMenu',
      { items },
      renderTrigger({
        expanded: false,
        focusTrigger: () => undefined,
        onPress: () => undefined,
        ref: { current: null },
      }),
    ),
});
mockModule('@/components/ui/ConfirmationContent', {
  ConfirmationContent: ({ children, ...props }: { children?: unknown }) =>
    createElement('ConfirmationContent', props, children as never),
});
mockModule('@/components/ui/ModalSheet', {
  ModalSheet: ({ children, ...props }: { children?: unknown }) =>
    createElement('ModalSheet', props, children as never),
});
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: (...args: unknown[]) => toastCalls.push(args) }),
});
mockModule('@/components/post/PostActionControl', {
  PostActionControl: (props: object) => createElement('PostActionControl', props),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: profileId }),
});

let renderer: ReactTestRenderer | null = null;
let PostDeletionAction: typeof PostDeletionActionExport;

before(async () => {
  ({ PostDeletionAction } = await import('./PostDeletionAction'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests.length = 0;
  analyticsCalls.length = 0;
  toastCalls.length = 0;
});

async function render(onDeleted: () => void) {
  await act(async () => {
    renderer = create(createElement(PostDeletionAction, { onDeleted, post: {} as never }));
  });
}

function actionMenu() {
  assert.ok(renderer);
  return renderer.root.findByType('ActionMenu' as never);
}

function confirmation() {
  assert.ok(renderer);
  return renderer.root.findByType('ConfirmationContent' as never);
}

async function openAndConfirm() {
  const deleteItem = (
    actionMenu().props.items as Array<{ key: string; onSelect: () => void }>
  ).find((item) => item.key === 'delete-post');
  assert.ok(deleteItem);
  await act(async () => deleteItem.onSelect());
  await act(async () => confirmation().props.onConfirm());
}

async function respond(index: number, response: Record<string, unknown>) {
  await act(async () => {
    requests[index]!.options.onCompleted(response);
  });
}

test('삭제 성공 응답은 post_deleted를 한 번 기록한다', async () => {
  let deleted = 0;
  await render(() => {
    deleted += 1;
  });
  await openAndConfirm();
  assert.equal(requests[0]?.name, 'PostDeletionActionDeletePostMutation');
  await respond(0, { deletePost: { postId } });

  assert.equal(deleted, 1);
  assert.deepEqual(analyticsCalls, [['post_deleted', {}]]);
  assert.deepEqual(toastCalls, []);
});

test('삭제 payload 누락은 post_deleted를 기록하지 않고 기존 오류 처리를 유지한다', async () => {
  let deleted = 0;
  await render(() => {
    deleted += 1;
  });
  await openAndConfirm();
  await respond(0, { deletePost: null });

  assert.equal(deleted, 0);
  assert.deepEqual(analyticsCalls, []);
  assert.deepEqual(toastCalls, [
    ['게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.', { tone: 'danger' }],
  ]);
});

test('삭제 payload ID가 다른 경우 기존 callback은 실행하지만 post_deleted는 기록하지 않는다', async () => {
  let deleted = 0;
  await render(() => {
    deleted += 1;
  });
  await openAndConfirm();
  await respond(0, { deletePost: { postId: 'post-other' } });

  assert.equal(deleted, 1);
  assert.deepEqual(analyticsCalls, []);
  assert.deepEqual(toastCalls, []);
});
