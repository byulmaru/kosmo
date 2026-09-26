import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ElementType, ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const actionBarType = 'PostActionBar' as ElementType;
const editorType = 'PostQuotePolicyEditor' as ElementType;

type Target = {
  content: { id: string };
  id: string;
  profile: {
    displayName: string;
    id: string;
    instance: { kind: 'LOCAL' };
    relativeHandle: string;
    viewerState: { profileMute: { id: string } | null };
  };
  quotePolicy?: 'EVERYONE' | 'FOLLOWERS' | 'AUTHOR' | null;
  viewerCanUpdateQuotePolicy?: boolean;
  visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS';
  actionBar: object;
  reactionController: object;
};

type MuteProps = {
  profile: Target['profile'];
  renderMenuItem: (props: {
    disabled: boolean;
    focusTriggerRef: { current: () => void };
    item: object;
  }) => ReactElement;
};

type ReportMenuInput = {
  id: string;
  kind: 'POST';
  label: string;
};

const target: Target = {
  actionBar: {},
  content: { id: 'content:1' },
  id: 'post:1',
  profile: {
    displayName: '코스모 작가',
    id: 'profile:author',
    instance: { kind: 'LOCAL' },
    relativeHandle: '@author',
    viewerState: { profileMute: { id: 'profile-mute:1' } },
  },
  reactionController: {},
  visibility: 'PUBLIC',
};
const capturedMute = { value: null as MuteProps | null };
const capturedReport = { value: null as ReportMenuInput | null };
let selectedProfileId = 'profile:viewer';
let PostActionSurface: ComponentType<{ socialActionTarget: never }>;
let renderer: ReactTestRenderer | null = null;

mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) => parts.join(''),
    useFragment: (_fragment: unknown, key: unknown) => key,
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: { View: (props: Record<string, unknown>) => createElement('View', props) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteController', {
  exports: {
    useProfileMuteMutations: () => {
      throw new Error('PostActionSurface must not own the profile mute mutation.');
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/content-report/ContentReportContext', {
  exports: {
    useContentReportMenuItem: (input: ReportMenuInput) => {
      capturedReport.value = input;
      return {
        key: 'report-post',
        label: '신고',
        onSelect: () => undefined,
      };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/session/SessionProvider', {
  exports: { useSession: () => ({ selectedProfileId }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostActionAuthentication', {
  exports: {
    usePostActionAuthentication: () => ({
      execution: { kind: 'enabled' },
      resolve: () => undefined,
      selectedProfileId,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostActionBar', {
  exports: {
    PostActionBar: (props: object) => createElement('PostActionBar', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostBookmarkAction', {
  exports: { useBookmarkFailureToast: () => () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostMoreMenu', {
  exports: { usePostMoreMenuItem: () => ({ key: 'copy-link', label: '링크 복사' }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostQuotePolicyEditor', {
  exports: {
    PostQuotePolicyEditor: (props: object) => createElement('PostQuotePolicyEditor', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./PostReactionController', {
  exports: { usePostReactionController: () => ({}) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./useRepostFailureToast', {
  exports: { useRepostFailureToast: () => () => undefined },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/reaction/PostReactionSummary', {
  exports: { PostReactionSummary: () => createElement('PostReactionSummary') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMuteAction', {
  exports: {
    ProfileMuteAction: (props: MuteProps) => {
      capturedMute.value = props;
      return createElement('ProfileMuteAction', props);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/components/profile/ProfileMoreMenu', {
  exports: { ProfileMoreMenu: (props: object) => createElement('ProfileMoreMenu', props) },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ PostActionSurface } = await import('./PostActionSurface'));
});

describe('PostActionSurface mute wiring', () => {
  it('현재 action target 작성자의 fragment를 mute action에 위임한다', async () => {
    capturedMute.value = null;
    capturedReport.value = null;

    await act(async () => {
      renderer = create(createElement(PostActionSurface, { socialActionTarget: target as never }));
    });

    if (!capturedMute.value) {
      throw new Error('PostActionSurface did not render ProfileMuteAction.');
    }
    assert.deepEqual(capturedReport.value, {
      id: target.id,
      kind: 'POST',
      label: '@author의 게시물 · post:1',
    });
    const mute = capturedMute.value as unknown as MuteProps;
    assert.equal(mute.profile, target.profile);
    const muteItem = { key: 'mute', label: '뮤트' };
    const menu = mute.renderMenuItem({
      disabled: false,
      focusTriggerRef: { current: () => undefined },
      item: muteItem,
    });
    const menuProps = menu.props as { disabled: boolean; items: object[] };
    assert.equal(menuProps.disabled, false);
    assert.deepEqual(menuProps.items, [{ key: 'copy-link', label: '링크 복사' }, muteItem]);
  });
});

describe('PostActionSurface Quote policy menu', () => {
  for (const visibility of ['PUBLIC', 'UNLISTED'] as const) {
    it(`${visibility} 작성자의 정책 메뉴는 현재 Post의 편집기를 열고 닫는다`, async () => {
      selectedProfileId = target.profile.id;
      await act(async () => {
        renderer = create(
          createElement(PostActionSurface, {
            socialActionTarget: {
              ...target,
              quotePolicy: 'FOLLOWERS',
              viewerCanUpdateQuotePolicy: true,
              visibility,
            } as never,
          }),
        );
      });
      const root = renderer!.root;
      assert.equal(root.findAllByType(editorType).length, 0);
      const items = root.findByType(actionBarType).props.moreItems as {
        key: string;
        onSelect: () => void;
      }[];
      const policyItem = items.find(({ key }) => key === 'quote-policy');
      assert.ok(policyItem);
      await act(async () => policyItem.onSelect());
      const editor = root.findByType(editorType);
      assert.equal(editor.props.postId, 'post:1');
      assert.equal(editor.props.policy, 'FOLLOWERS');
      assert.equal(editor.props.visibility, visibility);
      await act(async () => editor.props.onClose());
      assert.equal(root.findAllByType(editorType).length, 0);
    });
  }

  for (const [name, overrides] of [
    ['수정 권한 없음', { viewerCanUpdateQuotePolicy: false }],
    ['Followers 게시물', { visibility: 'FOLLOWERS' }],
    ['원격 게시물처럼 Local 정책 없음', { quotePolicy: null }],
  ] as const) {
    it(`${name}이면 Quote 정책 메뉴를 제공하지 않는다`, async () => {
      selectedProfileId = target.profile.id;
      await act(async () => {
        renderer = create(
          createElement(PostActionSurface, {
            socialActionTarget: {
              ...target,
              quotePolicy: 'EVERYONE',
              viewerCanUpdateQuotePolicy: true,
              ...overrides,
            } as never,
          }),
        );
      });
      const root = renderer!.root;
      const items = root.findByType(actionBarType).props.moreItems as { key: string }[];
      assert.equal(
        items.some(({ key }) => key === 'quote-policy'),
        false,
      );
      assert.equal(root.findAllByType(editorType).length, 0);
    });
  }
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  selectedProfileId = 'profile:viewer';
});
