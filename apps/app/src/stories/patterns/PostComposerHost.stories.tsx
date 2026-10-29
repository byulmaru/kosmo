import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostComposerHost } from '@/components/post/PostComposerHost';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostComposerHostStoriesQuery as Query } from './__generated__/PostComposerHostStoriesQuery.graphql';

function HostFixture() {
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
  return profiles[0] ? (
    <View style={{ width: 326 }}>
      <PostComposerHost
        mode="rail"
        onExpand={fn()}
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
