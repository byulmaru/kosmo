import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  MobileFullscreenComposerShellCandidate as MobileFullscreenComposerShellCandidateComponent,
  PostComposer as PostComposerComponent,
} from './PostComposer';
import type { PostComposerMentionInput as PostComposerMentionInputComponent } from './PostComposerMentionInput';
import type {
  PostComposerMentionCandidate,
  PostComposerMentionCandidateResults,
  PostComposerMentionQuery,
} from './postComposerState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const platform = { OS: 'web' };

mockModule(require.resolve('react-native'), {
  Animated: { View: 'AnimatedView' },
  Modal: 'Modal',
  Platform: platform,
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  useWindowDimensions: () => ({ height: 800, width: 1200 }),
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), {
  AtSignIcon: 'AtSignIcon',
  ChartNoAxesColumnIncreasingIcon: 'ChartNoAxesColumnIncreasingIcon',
  ChevronDownIcon: 'ChevronDownIcon',
  ExpandIcon: 'ExpandIcon',
  GlobeIcon: 'GlobeIcon',
  ImagePlusIcon: 'ImagePlusIcon',
  LockIcon: 'LockIcon',
  MoonIcon: 'MoonIcon',
  SmileIcon: 'SmileIcon',
  TriangleAlertIcon: 'TriangleAlertIcon',
  XIcon: 'XIcon',
});
mockModule(require.resolve('react-native-svg'), { Circle: 'Circle', Svg: 'Svg' });
mockModule('@/components/FeatureFlagsContext', { useFeatureFlag: () => true });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/IconButton', { IconButton: 'IconButton' });
mockModule('@/components/ui/useAnimatedColorTransition', {
  useAnimatedColorTransition: ({ color }: { color: string }) => color,
  useAnimatedOpacityTransition: ({ opacity }: { opacity: number }) => opacity,
});
mockModule(new URL('../ui/TextField.tsx', import.meta.url), {
  TextArea: 'TextArea',
  TextField: 'TextField',
});
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({}),
  useReducedMotion: () => false,
  useTheme: () => ({
    backgroundElevated: '#fff',
    backgroundCanvas: '#fff',
    backgroundSurface: '#fff',
    borderDefault: '#ddd',
    borderSubtle: '#ddd',
    foregroundPrimary: '#111',
    foregroundSecondary: '#666',
    foregroundMuted: '#666',
    feedbackDangerOnSubtle: '#900',
    primary: '#00f',
    stateDisabledForeground: '#999',
    stateHover: '#eee',
    statePressed: '#eee',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1 },
  iconSizes: { 16: 16, 20: 20, 24: 24 },
  radius: { 8: 8, 12: 12 },
  space: { 0: 0, 4: 4, 8: 8, 12: 12, 16: 16 },
  textStyles: { contentM: {}, uiCopyM: {}, uiCopyS: {}, uiHeadingS: {}, uiLabelM: {} },
  webScrollbarStyle: () => ({}),
});
mockModule('./PostComposerMediaItemsTarget', { PostComposerMediaItemsTarget: 'MediaItems' });

let PostComposerMentionInput: typeof PostComposerMentionInputComponent;
let PostComposer: typeof PostComposerComponent;
let MobileFullscreenComposerShellCandidate: typeof MobileFullscreenComposerShellCandidateComponent;

before(async () => {
  ({ PostComposerMentionInput } = await import('./PostComposerMentionInput'));
  ({ MobileFullscreenComposerShellCandidate, PostComposer } = await import('./PostComposer'));
});

after(() => {
  mock.restoreAll();
});

const profileAlice: PostComposerMentionCandidate = {
  avatar: { url: 'https://example.com/alice.png' },
  displayName: '앨리스',
  domain: 'remote.example',
  id: 'profile-alice',
  relativeHandle: '@alice',
};

function renderMentionInput({
  body = '@ali',
  authorProfileId = 'profile-author',
  candidates = [profileAlice],
  query = 'ali',
  onSelect = () => undefined,
  onBodyChange = () => undefined,
  onSelectionChange = () => undefined,
}: {
  authorProfileId?: string;
  body?: string;
  candidates?: readonly PostComposerMentionCandidate[];
  onBodyChange?: (body: string) => void;
  onSelectionChange?: (selection: { end: number; start: number }) => void;
  onSelect?: (candidate: PostComposerMentionCandidate, query: PostComposerMentionQuery) => void;
  query?: string;
} = {}) {
  let inputProps: Record<string, unknown> = {};
  let focusCount = 0;
  const inputRef = { current: { focus: () => focusCount++ } };
  const mentionCandidates: PostComposerMentionCandidateResults = {
    authorProfileId,
    profiles: candidates,
    query,
  };
  let renderer: ReactTestRenderer | null = null;
  let currentBody = body;
  let selection = { start: body.length, end: body.length };
  let selectionToApply: { end: number; start: number } | undefined;
  const render = (
    nextBody = currentBody,
    nextAuthor = authorProfileId,
    nextResults = mentionCandidates,
  ) =>
    createElement(PostComposerMentionInput, {
      authorProfileId: nextAuthor,
      body: nextBody,
      inputRef: inputRef as never,
      mentionCandidates: nextResults,
      onBodyChange: (value) => {
        currentBody = value;
        selectionToApply = undefined;
        onBodyChange(value);
        renderer?.update(render());
      },
      onSelectionChange: (value) => {
        selection = value;
        selectionToApply = undefined;
        onSelectionChange(value);
        renderer?.update(render());
      },
      onSelectMention: (candidate, query) => {
        onSelect(candidate, query);
        currentBody =
          currentBody.slice(0, query.start) +
          candidate.relativeHandle +
          ' ' +
          currentBody.slice(query.end);
        const caret = query.start + candidate.relativeHandle.length + 1;
        selection = { start: caret, end: caret };
        selectionToApply = selection;
        renderer?.update(render());
      },
      renderInput: ({ webProps, ...props }) => {
        inputProps = { ...props, ...webProps };
        return createElement('TextInput', inputProps);
      },
      selection,
      selectionToApply,
    });

  return {
    get focusCount() {
      return focusCount;
    },
    get inputProps() {
      return inputProps;
    },
    render,
    setRenderer(value: ReactTestRenderer) {
      renderer = value;
    },
    get renderer() {
      return renderer;
    },
  };
}

test('shows one query prompt and scopes candidate rows by author and query', async () => {
  const input = renderMentionInput({ body: '@' });
  await act(async () => {
    input.setRenderer(create(input.render()));
  });

  assert.equal(input.renderer?.root.findAllByType('Pressable' as never).length, 0);
  assert.ok(
    input.renderer?.root
      .findAllByType('Text' as never)
      .some((node) => node.children.join('') === '검색어를 입력하세요.'),
  );

  const staleByAuthor = renderMentionInput();
  await act(async () => {
    staleByAuthor.setRenderer(create(staleByAuthor.render('@ali', 'profile-other')));
  });
  assert.equal(staleByAuthor.renderer?.root.findAllByType('Pressable' as never).length, 0);

  const staleByQuery = renderMentionInput();
  await act(async () => {
    staleByQuery.setRenderer(create(staleByQuery.render('@bob')));
  });
  assert.equal(staleByQuery.renderer?.root.findAllByType('Pressable' as never).length, 0);
});

test('passes editor selection changes to its controlled owner', async () => {
  const changes: Array<{ body: string }> = [];
  const selections: Array<{ end: number; start: number }> = [];
  const input = renderMentionInput({
    onBodyChange: (body) => changes.push({ body }),
    onSelectionChange: (selection) => selections.push(selection),
  });
  await act(async () => {
    input.setRenderer(create(input.render()));
  });

  await act(async () => {
    (input.inputProps.onSelectionChange as (event: unknown) => void)({
      nativeEvent: { selection: { start: 0, end: 0 } },
    });
  });
  await act(async () => {
    (input.inputProps.onChangeText as (value: string) => void)('x@ali');
  });

  assert.deepEqual(changes, [
    {
      body: 'x@ali',
    },
  ]);
  assert.deepEqual(selections, [{ start: 0, end: 0 }]);
  assert.equal(input.inputProps.selection, undefined);
});

test('selects the highlighted candidate after IME composition and restores the editor caret', async () => {
  const profileAlina: PostComposerMentionCandidate = {
    displayName: '알리나',
    id: 'profile-alina',
    relativeHandle: '@alina',
  };
  const selected: Array<{
    candidate: PostComposerMentionCandidate;
    query: PostComposerMentionQuery;
  }> = [];
  const input = renderMentionInput({
    candidates: [profileAlice, profileAlina],
    onSelect: (candidate, query) => selected.push({ candidate, query }),
  });
  await act(async () => {
    input.setRenderer(create(input.render()));
  });

  let prevented = false;
  await act(async () => {
    (input.inputProps.onKeyPress as (event: unknown) => void)({
      nativeEvent: { isComposing: true, key: 'Enter', keyCode: 229 },
      preventDefault: () => {
        prevented = true;
      },
    });
  });
  assert.equal(prevented, false);
  assert.equal(selected.length, 0);

  await act(async () => {
    (input.inputProps.onKeyPress as (event: unknown) => void)({
      nativeEvent: { key: 'ArrowDown' },
      preventDefault: () => {
        prevented = true;
      },
    });
  });
  assert.equal(prevented, true);
  assert.equal(input.inputProps['aria-activedescendant']?.toString().endsWith('option-1'), true);

  await act(async () => {
    (input.inputProps.onKeyPress as (event: unknown) => void)({
      nativeEvent: { key: 'Enter' },
      preventDefault: () => undefined,
    });
  });
  assert.deepEqual(selected, [
    {
      candidate: profileAlina,
      query: { end: 4, query: 'ali', start: 0 },
    },
  ]);
  assert.deepEqual(input.inputProps.selection, { end: 7, start: 7 });
  assert.equal(input.focusCount, 1);

  await act(async () => {
    input.renderer?.update(
      input.render('@alina ', 'profile-author', {
        authorProfileId: 'profile-author',
        profiles: [profileAlina],
        query: 'ali',
      }),
    );
  });
  assert.deepEqual(input.inputProps.selection, { end: 7, start: 7 });
  assert.equal(input.inputProps['aria-activedescendant'], undefined);
});

test('desktop and mobile body inputs omit observed selection and apply only a one-shot caret', async () => {
  const postComposerProps = {
    author: null,
    authorProfileId: 'profile-author',
    body: '@ali',
    contentWarning: '',
    contentWarningExpanded: false,
    items: [],
    mentionCandidates: {
      authorProfileId: 'profile-author',
      profiles: [profileAlice],
      query: 'ali',
    },
    mentionSearchState: 'ready' as const,
    onBodyChange: () => undefined,
    onContentWarningChange: () => undefined,
    onContentWarningToggle: () => undefined,
    onEmojiAction: () => undefined,
    onExpand: () => undefined,
    onMediaAction: () => undefined,
    onMediaEdit: () => undefined,
    onMediaRemove: () => undefined,
    onMediaRetry: () => undefined,
    onPollAction: () => undefined,
    onSelectionChange: () => undefined,
    onSubmit: () => undefined,
    onVisibilityChange: () => undefined,
    remaining: 500,
    selection: { start: 4, end: 4 },
    sensitiveMedia: false,
    showCWAction: false,
    showEmojiAction: false,
    showMediaAction: false,
    showPollAction: false,
    showSubmit: false,
    surface: 'rail' as const,
    visibility: 'PUBLIC' as const,
  };

  for (const { Component, hostType, platformOS } of [
    { Component: PostComposer, hostType: 'TextArea', platformOS: 'web' },
    {
      Component: MobileFullscreenComposerShellCandidate,
      hostType: 'TextInput',
      platformOS: 'web',
    },
    {
      Component: MobileFullscreenComposerShellCandidate,
      hostType: 'TextInput',
      platformOS: 'ios',
    },
  ] as const) {
    const selections: Array<{ end: number; start: number }> = [];
    const bodies: string[] = [];
    let props = {
      ...postComposerProps,
      body: '@ali',
      onBodyChange: (body: string) => bodies.push(body),
      onSelectionChange: (selection: { end: number; start: number }) => selections.push(selection),
      selection: { start: 4, end: 4 },
      selectionToApply: undefined as { end: number; start: number } | undefined,
    };
    platform.OS = platformOS;
    const element = () =>
      Component === PostComposer
        ? createElement(PostComposer, { ...props, surface: 'rail' })
        : createElement(MobileFullscreenComposerShellCandidate, {
            ...props,
            onOverlayClose: () => undefined,
          });

    let renderer: ReactTestRenderer | null = null;
    const bodyInput = () => renderer?.root.findByType(hostType as never);
    await act(async () => {
      renderer = create(element());
    });
    assert.equal(Object.hasOwn(bodyInput()?.props ?? {}, 'selection'), false);

    const observed = { start: 2, end: 2 };
    await act(async () => {
      (bodyInput()?.props.onSelectionChange as (event: unknown) => void)({
        nativeEvent: { selection: observed },
      });
    });
    assert.deepEqual(selections, [observed]);
    props = { ...props, selection: observed };
    await act(async () => renderer?.update(element()));
    assert.equal(Object.hasOwn(bodyInput()?.props ?? {}, 'selection'), false);

    await act(async () => {
      (bodyInput()?.props.onChangeText as (body: string) => void)('@ali!');
    });
    assert.deepEqual(bodies, ['@ali!']);
    props = { ...props, body: '@ali!', selectionToApply: undefined };
    await act(async () => renderer?.update(element()));
    assert.equal(Object.hasOwn(bodyInput()?.props ?? {}, 'selection'), false);

    const insertionCaret = { start: 7, end: 7 };
    props = { ...props, body: '@alina ', selectionToApply: insertionCaret };
    await act(async () => renderer?.update(element()));
    assert.deepEqual(bodyInput()?.props.selection, insertionCaret);

    await act(async () => {
      (bodyInput()?.props.onSelectionChange as (event: unknown) => void)({
        nativeEvent: { selection: insertionCaret },
      });
    });
    props = { ...props, selection: insertionCaret, selectionToApply: undefined };
    await act(async () => renderer?.update(element()));
    assert.equal(Object.hasOwn(bodyInput()?.props ?? {}, 'selection'), false);

    props = { ...props, selectionToApply: insertionCaret };
    await act(async () => renderer?.update(element()));
    assert.deepEqual(bodyInput()?.props.selection, insertionCaret);
    await act(async () => {
      (bodyInput()?.props.onChangeText as (body: string) => void)('@alina !');
    });
    props = { ...props, body: '@alina !', selectionToApply: undefined };
    await act(async () => renderer?.update(element()));
    assert.equal(Object.hasOwn(bodyInput()?.props ?? {}, 'selection'), false);
    await act(async () => renderer?.unmount());
  }
});

test('shows empty-result feedback without a selection action', async () => {
  const empty = renderMentionInput({ candidates: [] });
  await act(async () => {
    empty.setRenderer(create(empty.render()));
  });
  assert.equal(
    empty.renderer?.root
      .findAllByType('Text' as never)
      .some((node) => node.children.join('') === '검색 결과가 없어요.'),
    true,
  );
  assert.equal(empty.renderer?.root.findAllByType('Pressable' as never).length, 0);
});
