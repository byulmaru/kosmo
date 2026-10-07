import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerMentionInput as PostComposerMentionInputComponent } from './PostComposerMentionInput';
import type {
  PostComposerMentionCandidate,
  PostComposerMentionCandidateResults,
  PostComposerMentionQuery,
} from './postComposerState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundElevated: '#fff',
    borderDefault: '#ddd',
    foregroundPrimary: '#111',
    foregroundSecondary: '#666',
    stateHover: '#eee',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  radius: { 12: 12 },
  space: { 4: 4, 8: 8, 12: 12 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiLabelM: {} },
});

let PostComposerMentionInput: typeof PostComposerMentionInputComponent;

before(async () => {
  ({ PostComposerMentionInput } = await import('./PostComposerMentionInput'));
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
        onBodyChange(value);
      },
      onSelectionChange: (value) => {
        selection = value;
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
        renderer?.update(render());
      },
      renderInput: ({ webProps, ...props }) => {
        inputProps = { ...props, ...webProps };
        return createElement('TextInput', inputProps);
      },
      selection,
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
  assert.deepEqual(input.inputProps.selection, { start: 0, end: 0 });
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
