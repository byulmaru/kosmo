import { expect, within } from 'storybook/test';
import { ProfileEditImageFields } from '@/components/profile/ProfileEditImageFields';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ProfileEditImageDraft } from '@/components/profile/profileEditState';

const currentAvatar: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: null,
};

const currentHeader: ProfileEditImageDraft = {
  kind: 'current',
  previewUri: null,
};

const meta = {
  args: {
    avatar: currentAvatar,
    header: currentHeader,
    onAvatarEdit: () => undefined,
    onHeaderEdit: () => undefined,
  },
  component: ProfileEditImageFields,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'kosmoMobile' },
  },
  title: 'KOSMO/Profiles/Profile Edit',
} satisfies Meta<typeof ProfileEditImageFields>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ImageFields: Story = {
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeVisible();
    expect(canvas.queryByText(/현재.*유지/)).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '교체' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('button', { name: '제거' })).not.toBeInTheDocument();

    const preview = canvas.getByTestId('profile-edit-header-preview');
    const rect = preview.getBoundingClientRect();
    expect(Math.round(rect.width)).toBe(390);
    expect(Math.round(rect.height)).toBe(130);
  },
};

export const ImageFieldsWithoutCallbacks: Story = {
  args: {
    onAvatarEdit: undefined,
    onHeaderEdit: undefined,
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('button', { name: '헤더 이미지 변경' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeDisabled();
  },
};

export const ImageFieldsWide: Story = {
  parameters: {
    viewport: { defaultViewport: 'kosmoPickerWide' },
  },
  play: ({ canvasElement }) => {
    const preview = within(canvasElement).getByTestId('profile-edit-header-preview');
    const rect = preview.getBoundingClientRect();

    expect(Math.round(rect.width)).toBe(600);
    expect(Math.round(rect.height)).toBe(200);
  },
};

export const HeaderErrorKeepsCurrentAvatar: Story = {
  args: {
    header: {
      error: '헤더 이미지를 준비하지 못했어요.',
      kind: 'replacement',
      previewUri: null,
      uploadState: 'error',
    },
  },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('alert')).toHaveTextContent('헤더 이미지를 준비하지 못했어요.');
    expect(canvas.getByTestId('profile-edit-avatar-preview')).toBeVisible();
    expect(canvas.getByRole('button', { name: '아바타 이미지 편집' })).toBeEnabled();
    expect(canvas.queryByText(/아바타.*준비하지 못했어요/)).not.toBeInTheDocument();
  },
};
