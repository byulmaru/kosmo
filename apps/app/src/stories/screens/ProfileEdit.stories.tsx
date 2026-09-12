import { useState } from 'react';
import { fn } from 'storybook/test';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import { ProfileEditScreen } from '@/components/profile/ProfileEditScreen';
import appleTouchIconUrl from '../../../public/apple-touch-icon.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ProfileEditDraft,
  ProfileEditImageDraft,
} from '@/components/profile/profileEditState';

const currentAvatar: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: appleTouchIconUrl,
};

const currentHeader: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: appleTouchIconUrl,
};

const initialDraft: ProfileEditDraft = {
  avatar: currentAvatar,
  bio: '창작과 개발을 좋아합니다.',
  displayName: '코스모',
  followPolicy: 'OPEN',
  header: currentHeader,
  tags: ['공예', '개발'],
};

function ProfileEditStory({ startingValue = initialDraft }: { startingValue?: ProfileEditDraft }) {
  const [value, setValue] = useState(startingValue);

  return (
    <ProfileEditScreen
      initialValue={initialDraft}
      onAvatarEdit={fn()}
      onAvatarRemove={fn()}
      onBack={fn()}
      onChange={setValue}
      onHeaderEdit={fn()}
      onHeaderRemove={fn()}
      onSubmit={fn()}
      value={value}
    />
  );
}

const meta = {
  args: {
    avatar: currentAvatar,
    header: currentHeader,
    onAvatarEdit: fn(),
    onAvatarRemove: fn(),
    onAvatarRetry: fn(),
    onHeaderEdit: fn(),
    onHeaderRemove: fn(),
    onHeaderRetry: fn(),
  },
  component: ProfileEditImageFields,
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Screens/Profile Edit/Catalog',
} satisfies Meta<typeof ProfileEditImageFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Mobile390Clean: Story = {
  render: () => <ProfileEditStory />,
};

export const Compact1024Clean: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  render: () => <ProfileEditStory />,
};

export const Full1440DarkDirty: Story = {
  globals: { theme: 'dark', viewport: { isRotated: false, value: 'kosmoProfileFull' } },
  render: () => <ProfileEditStory startingValue={{ ...initialDraft, bio: '바뀐 소개입니다.' }} />,
};
