import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { FullReactionOverlay } from '@/components/post/FullReactionOverlay';
import { PostMediaViewer, PostMediaViewerContent } from '@/components/post/PostMediaViewer';
import { ActionMenu, ActionMenuPresentationProvider } from '@/components/ui/ActionMenu';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import ogImage from '../../../public/og-default.png?url';
import { post } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostMediaViewerKeyboardStoryQuery } from './__generated__/PostMediaViewerKeyboardStoryQuery.graphql';

const viewerPost = post({
  id: 'keyboard-viewer-post',
  media: Array.from({ length: 3 }, (_, index) => ({
    __typename: 'Media',
    altText: `키보드 탐색 이미지 ${index + 1}`,
    id: `keyboard-media-${index + 1}`,
    url: ogImage,
  })),
});

const operation = graphql`
  query PostMediaViewerKeyboardStoryQuery($id: ID!) {
    node(id: $id) {
      __typename
      ... on Post {
        ...PostMediaViewer_post @alias(as: "viewer")
      }
    }
  }
`;

function KeyboardViewerFixture() {
  const data = useLazyLoadQuery<PostMediaViewerKeyboardStoryQuery>(operation, {
    id: viewerPost.id,
  });
  const originControl = useRef<View>(null);
  const nestedControl = useRef<View>(null);
  const reactionControl = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [keyTarget, setKeyTarget] = useState('');
  // Observe the real key target after focus leaves the Modal without replacing its key handling.
  useEffect(() => {
    const observe = (event: KeyboardEvent) => setKeyTarget((event.target as HTMLElement).tagName);
    document.addEventListener('keydown', observe, true);
    return () => document.removeEventListener('keydown', observe, true);
  }, []);
  if (data.node?.__typename !== 'Post' || !data.node.viewer) {
    throw new Error('이미지 뷰어 keyboard fixture에는 Post가 필요합니다.');
  }

  const controls = (
    <View style={{ gap: 8, padding: 8 }}>
      <ActionMenuPresentationProvider presentation="sheet">
        <ActionMenu
          accessibilityLabel="이미지 작업"
          items={[{ key: 'done', label: '메뉴 닫기', onSelect: () => undefined }]}
          renderTrigger={({ onPress, ref }) => (
            <Pressable accessibilityRole="button" onPress={onPress} ref={ref}>
              <Text>메뉴 열기</Text>
            </Pressable>
          )}
        />
      </ActionMenuPresentationProvider>
      <Pressable accessibilityRole="button" onPress={() => setPicker(true)} ref={reactionControl}>
        <Text>반응 선택 창 열기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setDialog(true)}>
        <Text>대화상자 열기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setNested(true)} ref={nestedControl}>
        <Text>다른 이미지 뷰어 열기</Text>
      </Pressable>
      <input aria-label="한 줄 입력" defaultValue="입력 내용" />
      <textarea aria-label="여러 줄 입력" defaultValue="입력 내용" rows={1} />
      <select aria-label="선택 입력" defaultValue="first">
        <option value="first">첫 항목</option>
        <option value="second">두 번째 항목</option>
      </select>
      <div aria-label="편집 영역" contentEditable role="textbox" suppressContentEditableWarning>
        <span data-testid="viewer-editable-child">편집할 내용</span>
      </div>
    </View>
  );

  return (
    <div
      data-last-key-target={keyTarget}
      data-testid="viewer-keyboard-fixture"
      data-user-agent={navigator.userAgent}
    >
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} ref={originControl}>
        <Text>이미지 뷰어 열기</Text>
      </Pressable>
      {open ? (
        <PostMediaViewer
          onClose={() => setOpen(false)}
          originControl={originControl}
          selectedIndex={0}
        >
          <PostMediaViewerContent
            actionBar={controls}
            post={data.node.viewer}
            wideDetail={controls}
          />
          <FullReactionOverlay
            onClose={() => setPicker(false)}
            onQueryChange={setQuery}
            onSelect={() => undefined}
            open={picker}
            options={[
              {
                category: 'people',
                categoryLabel: '사람',
                emoji: '👋',
                id: 'wave',
                label: '손 흔들기',
              },
            ]}
            query={query}
            selectedValues={[]}
            triggerRef={reactionControl}
          />
          <ModalOverlay
            accessibilityLabel="추가 대화상자"
            onRequestClose={() => setDialog(false)}
            visible={dialog}
          >
            <View style={{ backgroundColor: 'white', padding: 16 }}>
              <Text>대화상자 내용</Text>
              <Pressable accessibilityRole="button" onPress={() => setDialog(false)}>
                <Text>추가 대화상자 닫기</Text>
              </Pressable>
            </View>
          </ModalOverlay>
          {nested ? (
            <PostMediaViewer
              onClose={() => setNested(false)}
              originControl={nestedControl}
              selectedIndex={0}
            >
              <PostMediaViewerContent
                actionBar={<Text>위쪽 이미지 뷰어</Text>}
                post={data.node.viewer}
                wideDetail={<Text>위쪽 이미지 뷰어</Text>}
              />
            </PostMediaViewer>
          ) : null}
        </PostMediaViewer>
      ) : null}
    </div>
  );
}

const meta = {
  component: KeyboardViewerFixture,
  globals: { reduceMotion: true },
  parameters: {
    layout: 'fullscreen',
    relay: { data: { node: viewerPost } },
  },
  title: 'KOSMO/Patterns/Post Media Viewer/Keyboard Tests',
} satisfies Meta<typeof KeyboardViewerFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openViewer() {
  await userEvent.click(await screen.findByRole('button', { name: '이미지 뷰어 열기' }));
  await screen.findByRole('dialog', { name: '이미지 뷰어' });
  await waitFor(() => expect(screen.getByTestId('post-media-viewer-close')).toHaveFocus());
  return screen.getByTestId('post-media-viewer-dialog');
}

async function expectPosition(dialog: HTMLElement, position: string) {
  await waitFor(() =>
    expect(within(dialog).getByTestId('post-media-viewer-position')).toHaveTextContent(position),
  );
}

const navigationAfterClick: Story['play'] = async () => {
  const dialog = await openViewer();
  await userEvent.keyboard('{ArrowRight}');
  await expectPosition(dialog, '2 / 3');
  await userEvent.click(within(dialog).getByTestId('post-media-viewer-image'));
  expect(document.activeElement).toBe(document.body);
  await userEvent.keyboard('{ArrowRight}');
  await expectPosition(dialog, '3 / 3');
  await userEvent.keyboard('{ArrowRight}');
  await expectPosition(dialog, '3 / 3');
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
  await expectPosition(dialog, '1 / 3');
  await userEvent.click(within(dialog).getByRole('button', { name: '다음 이미지' }));
  await expectPosition(dialog, '2 / 3');
  await userEvent.click(within(dialog).getByRole('button', { name: '이전 이미지' }));
  await expectPosition(dialog, '1 / 3');
  await userEvent.click(within(dialog).getByTestId('post-media-viewer-image'));
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '이미지 뷰어 열기' })).toHaveFocus(),
  );
};

export const CompactNavigationAfterImageClick: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: navigationAfterClick,
};

export const WideNavigationAfterImageClick: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMediaViewerWide' } },
  play: navigationAfterClick,
};

export const EditableAndHandledKeys: Story = {
  play: async () => {
    const dialog = await openViewer();
    for (const name of ['한 줄 입력', '여러 줄 입력', '선택 입력', '편집 영역']) {
      await userEvent.click(within(dialog).getByLabelText(name));
      await userEvent.keyboard('{ArrowRight}');
      await expectPosition(dialog, '1 / 3');
      await userEvent.keyboard('{ArrowLeft}');
      await expectPosition(dialog, '1 / 3');
    }
    await userEvent.click(within(dialog).getByTestId('viewer-editable-child'));
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '1 / 3');
    await userEvent.click(within(dialog).getByTestId('post-media-viewer-image'));
    for (const modifier of ['Alt', 'Control', 'Meta']) {
      await userEvent.keyboard(`{${modifier}>}{ArrowRight}{/${modifier}}`);
      await expectPosition(dialog, '1 / 3');
    }
    const handled = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    await expectPosition(dialog, '1 / 3');
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
};

export const ChildOverlayKeyboardOwnership: Story = {
  play: async () => {
    const dialog = await openViewer();
    await userEvent.click(within(dialog).getByRole('button', { name: '메뉴 열기' }));
    await screen.findByRole('dialog', { name: '이미지 작업' });
    const menu = await screen.findByRole('menu', { name: '이미지 작업' });
    expect(dialog.contains(menu)).toBe(false);
    within(menu).getByRole('menuitem').focus();
    within(menu).getByRole('menuitem').blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '1 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');

    await userEvent.click(within(dialog).getByRole('button', { name: '반응 선택 창 열기' }));
    const popup = await screen.findByRole('dialog', { name: '반응 선택' });
    expect(dialog.contains(popup)).toBe(true);
    within(popup).getByRole('searchbox').focus();
    within(popup).getByRole('searchbox').blur();
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(popup).not.toBeInTheDocument());
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    await expectPosition(dialog, '1 / 3');
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');

    await userEvent.click(within(dialog).getByRole('button', { name: '대화상자 열기' }));
    const child = await screen.findByRole('dialog', { name: '추가 대화상자' });
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(child).not.toBeInTheDocument());
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    await expectPosition(dialog, '1 / 3');

    await userEvent.click(within(dialog).getByRole('button', { name: '다른 이미지 뷰어 열기' }));
    await waitFor(() => expect(screen.getAllByTestId('post-media-viewer-dialog')).toHaveLength(2));
    const nestedDialog = screen.getAllByTestId('post-media-viewer-dialog')[1];
    await waitFor(() =>
      expect(nestedDialog.closest('[aria-modal="true"]')).toHaveAttribute('role', 'dialog'),
    );
    await userEvent.click(within(nestedDialog).getByTestId('post-media-viewer-image'));
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(nestedDialog, '2 / 3');
    await expectPosition(dialog, '1 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(nestedDialog).not.toBeInTheDocument());
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    await expectPosition(dialog, '2 / 3');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
};

export const ManualReproduction: Story = {};
