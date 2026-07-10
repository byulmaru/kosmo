import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PostBody } from '@/components/post/PostBody';
import { PostComposer } from '@/components/post/PostComposer';
import { PostLayout } from '@/components/post/PostLayout';
import { PostList } from '@/components/post/PostList';
import { PostListItem } from '@/components/post/PostListItem';
import { longBody, post, profile, profileWithPosts, timeline } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const shortPost = post({ bodyText: '짧은 본문 한 줄.', id: 'short' });
const longPost = post({ bodyText: longBody, id: 'long' });
const multilinePost = post({
  bodyText: '첫 번째 문단입니다.\n두 번째 줄입니다.\n\n빈 줄 뒤의 마지막 문단입니다.',
  id: 'multiline',
});
const emptyPost = post({ bodyText: null, id: 'empty' });

function PostCatalog() {
  return (
    <Catalog>
      <Section title="Body · list md / detail lg / empty">
        <PostBody post={multilinePost as never} />
        <PostBody post={multilinePost as never} size="lg" />
        <PostBody post={emptyPost as never} />
      </Section>

      <Section title="List items · short / long / empty / old">
        <PostListItem post={shortPost as never} />
        <PostListItem post={longPost as never} />
        <PostListItem post={emptyPost as never} />
        <PostListItem
          post={
            post({
              bodyText: '하루 이상 지난 게시글입니다.',
              createdAt: '2026-04-27T21:14:00.000Z',
              id: 'old',
            }) as never
          }
        />
      </Section>

      <Section title="Detail layout and visibility">
        <PostLayout
          post={post({ bodyText: longBody, id: 'detail', visibility: 'FOLLOWERS' }) as never}
        />
      </Section>
    </Catalog>
  );
}

const meta = {
  component: PostCatalog,
  parameters: { router: { pathname: '/@kosmo/post-1' } },
  title: 'KOSMO/Content/Posts',
} satisfies Meta<typeof PostCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BodyTimeAndLayoutStates: Story = {};

export const ListLoadingErrorEmptyAndContent: Story = {
  render: () => (
    <Catalog>
      <Section title="Loading">
        <PostList loading />
      </Section>
      <Section title="Error and retry">
        <PostList error onRetry={() => undefined} />
      </Section>
      <Section title="Empty profile">
        <PostList profile={profileWithPosts([]) as never} />
      </Section>
      <Section title="Profile content">
        <PostList profile={profileWithPosts([shortPost, longPost, emptyPost]) as never} />
      </Section>
      <Section title="Home timeline content">
        <PostList homeTimeline={timeline(shortPost, multilinePost) as never} />
      </Section>
    </Catalog>
  ),
};

export const ComposerDefault: Story = {
  render: () => (
    <Catalog>
      <PostComposer profile={profile() as never} />
    </Catalog>
  ),
};

export const ComposerSubmitting: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => (
    <Catalog>
      <PostComposer profile={profile() as never} />
    </Catalog>
  ),
};

export const ComposerVisibilityAndSubmitInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.type(body, '스토리에서 작성한 게시글입니다.');
    await userEvent.click(canvas.getByRole('button', { name: '조용한 공개' }));

    const document = within(canvasElement.ownerDocument.body);
    await expect(document.findByRole('dialog', { name: '공개 범위' })).resolves.toBeVisible();
    await userEvent.click(await document.findByRole('radio', { name: '공개' }));
    await waitFor(() => {
      expect(document.queryByRole('dialog', { name: '공개 범위' })).not.toBeInTheDocument();
    });
    await expect(canvas.getByRole('button', { name: '공개' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(body).toHaveValue('');
  },
  render: () => (
    <Catalog>
      <PostComposer profile={profile() as never} />
    </Catalog>
  ),
};

export const ComposerErrorInteraction: Story = {
  parameters: { relay: { mutationError: '게시글 작성 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '게시글 본문' }),
      '오류 상태를 확인합니다.',
    );
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('게시글 작성 실패');
  },
  render: () => (
    <Catalog>
      <PostComposer profile={profile() as never} />
    </Catalog>
  ),
};
