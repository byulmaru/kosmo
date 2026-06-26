import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PostListItem from './PostListItem.svelte';
import type { PostListItem_post$key } from '$mearie';

vi.mock('@mearie/svelte', () => ({
  createFragment: (_fragment: unknown, fragmentRef: () => unknown) => ({
    get data() {
      return fragmentRef();
    },
    get metadata() {
      return undefined;
    },
  }),
}));

const post = {
  __typename: 'Post',
  id: 'story-post',
  content: {
    __typename: 'PostContent',
    id: 'story-post-content',
    bodyJson: createTipTapDocumentFromPlainText('Check post body link contract.'),
    bodyText: 'Check post body link contract.',
  },
  createdAt: '2026-04-27T21:14:00.000Z',
  profile: {
    __typename: 'Profile',
    id: 'story-profile',
    displayName: 'Kosmo Writer',
    handle: 'kosmo',
  },
} as unknown as PostListItem_post$key;

describe('PostListItem', () => {
  test('links visible author content to the profile and visible post content to the detail page', async () => {
    render(PostListItem, { post });

    await expect
      .element(page.getByRole('link', { name: /Kosmo Writer/ }))
      .toHaveAttribute('href', '/@kosmo');
    await expect
      .element(page.getByRole('link', { name: /Check post body link contract/ }))
      .toHaveAttribute('href', '/@kosmo/story-post');
    await expect.element(page.getByRole('link', { name: /post detail/i })).not.toBeInTheDocument();
  });
});
