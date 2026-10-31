import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostComposerHost } from '@/components/post/PostComposerHost';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostComposerHostStoriesQuery as Query } from './__generated__/PostComposerHostStoriesQuery.graphql';

function HostFixture({ mode = 'rail' }: { mode?: 'mobile' | 'rail' }) {
  const data = useLazyLoadQuery<Query>(
    graphql`
      query PostComposerHostStoriesQuery {
        me {
          profiles {
            ...PostComposer_profile
            ...PostComposerProfileSwitcher_profiles
          }
        }
      }
    `,
    {},
  );
  const [open, setOpen] = useState(true);
  const profiles = data.me?.profiles ?? [];
  const hostProps =
    mode === 'rail' ? { mode: 'rail' as const, onExpand: fn() } : { mode: 'mobile' as const };
  return profiles[0] ? (
    <View style={mode === 'rail' ? { width: 326 } : undefined}>
      <PostComposerHost
        {...hostProps}
        onRequestClose={() => setOpen(false)}
        open={open}
        profile={profiles[0]}
        profiles={profiles}
      />
    </View>
  ) : null;
}

const meta = {
  component: HostFixture,
  excludeStories: ['MobileFullscreenVisibleViewportContract'],
  title: 'KOSMO/Patterns/Post Composer Host',
  parameters: {
    relay: {
      data: {
        me: {
          __typename: 'Account',
          id: 'host-story-account',
          profiles: [
            {
              __typename: 'Profile',
              id: 'host-story-profile',
              displayName: '코스모 작가',
              handle: 'kosmo',
              relativeHandle: '@kosmo',
              avatar: null,
              private: { defaultPostVisibility: 'UNLISTED' },
            },
            {
              __typename: 'Profile',
              id: 'host-story-profile-other',
              displayName: '다른 작가',
              handle: 'other',
              relativeHandle: '@other',
              avatar: null,
              private: { defaultPostVisibility: 'UNLISTED' },
            },
          ],
        },
      },
    },
  },
} satisfies Meta<typeof HostFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await userEvent.type(body, '표시 경계가 바뀌어도 남는 초안');
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });
    await userEvent.click(trigger);
    await canvas.findByTestId('post-composer-profile-picker');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(body).toBeVisible();
    expect(body).toHaveValue('표시 경계가 바뀌어도 남는 초안');
  },
};

export const MobileFullscreenKeyboardFixture: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <HostFixture mode="mobile" />,
};

export const MobileFullscreenVisibleViewportContract: Story = {
  ...MobileFullscreenKeyboardFixture,
  play: async ({ canvasElement }) => {
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Post composer host viewport story requires a browser window.');
    }
    const viewport = storyWindow.visualViewport;
    if (!viewport) {
      throw new Error('Post composer host viewport story requires visualViewport.');
    }
    const originalHeightDescriptor = Object.getOwnPropertyDescriptor(viewport, 'height');
    const originalOffsetTopDescriptor = Object.getOwnPropertyDescriptor(viewport, 'offsetTop');
    const originalHeight = viewport.height;
    const originalOffsetTop = viewport.offsetTop;
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole('dialog', { name: '글쓰기' });
    const body = canvas.getByRole('textbox', { name: '게시글 본문' }) as HTMLTextAreaElement;
    const scroll = canvas.getByTestId('mobile-fullscreen-composer-scroll');
    const footer = canvas.getByTestId('mobile-composer-footer');

    try {
      await waitFor(() => expect(body).toHaveFocus());
      Object.defineProperty(viewport, 'height', { configurable: true, value: 360 });
      viewport.dispatchEvent(new storyWindow.Event('resize'));
      await waitFor(() => {
        const bounds = dialog.getBoundingClientRect();
        expect(bounds.top).toBeCloseTo(originalOffsetTop, 0);
        expect(bounds.height).toBeCloseTo(360, 0);
      });

      const shortScrollHeight = scroll.clientHeight;
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 40 });
      viewport.dispatchEvent(new storyWindow.Event('scroll'));
      await waitFor(() => expect(dialog.getBoundingClientRect().top).toBeCloseTo(40, 0));
      expect(dialog.getBoundingClientRect().height).toBeCloseTo(360, 0);
      const footerBottom = footer.getBoundingClientRect().bottom;
      expect(footerBottom).toBeLessThanOrEqual(401);

      for (let line = 1; line <= 16; line += 1) {
        await userEvent.type(body, `작성 줄 ${line}`);
        await userEvent.keyboard('{Enter}');
      }
      await userEvent.type(body, 'caret 끝');
      await waitFor(() => {
        expect(body.selectionStart).toBe(body.value.length);
        expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
        expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
      });
      expect(scroll).toContainElement(body);
      expect(dialog.getBoundingClientRect().top).toBeCloseTo(40, 0);
      expect(dialog.getBoundingClientRect().height).toBeCloseTo(360, 0);
      expect(footer.getBoundingClientRect().bottom).toBeCloseTo(footerBottom, 0);

      Object.defineProperty(viewport, 'height', {
        configurable: true,
        value: originalHeight,
      });
      Object.defineProperty(viewport, 'offsetTop', {
        configurable: true,
        value: originalOffsetTop,
      });
      viewport.dispatchEvent(new storyWindow.Event('resize'));
      await waitFor(() => {
        const bounds = dialog.getBoundingClientRect();
        expect(bounds.top).toBeCloseTo(originalOffsetTop, 0);
        expect(bounds.height).toBeCloseTo(originalHeight, 0);
        expect(scroll.clientHeight).toBeGreaterThan(shortScrollHeight);
      });
      expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        originalOffsetTop + originalHeight + 1,
      );
    } finally {
      if (originalHeightDescriptor) {
        Object.defineProperty(viewport, 'height', originalHeightDescriptor);
      } else {
        Reflect.deleteProperty(viewport, 'height');
      }
      if (originalOffsetTopDescriptor) {
        Object.defineProperty(viewport, 'offsetTop', originalOffsetTopDescriptor);
      } else {
        Reflect.deleteProperty(viewport, 'offsetTop');
      }
      viewport.dispatchEvent(new storyWindow.Event('resize'));
    }
  },
};
