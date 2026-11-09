import {
  MEDIA_USE_ATTRIBUTION_REQUIREMENT,
  MEDIA_USE_ORIGINAL_DESCRIPTION,
  MEDIA_USE_PERMISSION_DESCRIPTIONS,
  MEDIA_USE_PERMISSION_LABELS,
  MEDIA_USE_SCOPE_DESCRIPTIONS,
  MediaUsePermission,
} from '@kosmo/core/media-metadata';
import { expect, within } from 'storybook/test';
import { ImageUseTermsPage } from '@/components/public-policy/ImageUseTermsPage';
import type { MediaPublicationRights } from '@kosmo/core/media-metadata';
import type { Meta, StoryObj } from '@storybook/react-vite';

const TITLE = 'KOSMO 이미지 이용 조건 v1';
const selectedRights: MediaPublicationRights = {
  personal: MediaUsePermission.EDIT,
  noncommercial: MediaUsePermission.ORIGINAL,
  commercial: MediaUsePermission.DENY,
};

const meta = {
  args: { rights: selectedRights },
  component: ImageUseTermsPage,
  title: 'KOSMO/Components/Image use terms page',
} satisfies Meta<typeof ImageUseTermsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedRights: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible();
    expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute('href', '/');

    const purposes = [
      { scope: 'personal', title: '개인적 이용', permission: MediaUsePermission.EDIT },
      { scope: 'noncommercial', title: '비상업적 이용', permission: MediaUsePermission.ORIGINAL },
      { scope: 'commercial', title: '상업적 이용', permission: MediaUsePermission.DENY },
    ] as const;
    for (const purpose of purposes) {
      const heading = canvas.getByRole('heading', { name: purpose.title, level: 2 });
      const card = within(heading.parentElement!);
      expect(heading).toBeVisible();
      expect(card.getByText(MEDIA_USE_SCOPE_DESCRIPTIONS[purpose.scope])).toBeVisible();
      expect(card.getByText(MEDIA_USE_PERMISSION_LABELS[purpose.permission])).toBeVisible();
    }

    for (const permission of [
      MediaUsePermission.DENY,
      MediaUsePermission.ORIGINAL,
      MediaUsePermission.EDIT,
    ]) {
      expect(canvas.getAllByText(MEDIA_USE_PERMISSION_LABELS[permission])).toHaveLength(2);
      expect(canvas.getByText(MEDIA_USE_PERMISSION_DESCRIPTIONS[permission])).toBeVisible();
    }
    expect(canvas.getByText(MEDIA_USE_ATTRIBUTION_REQUIREMENT)).toBeVisible();
    expect(canvas.getByText(MEDIA_USE_ORIGINAL_DESCRIPTION)).toBeVisible();
    expect(
      canvas.getByText('AI 모델 학습 목적의 이용은 선택한 조건과 관계없이 허용되지 않습니다.'),
    ).toBeVisible();
  },
};

export const InvalidRights: Story = {
  args: { rights: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByRole('heading', { name: '유효하지 않은 이미지 이용 조건입니다.', level: 1 }),
    ).toBeVisible();
    expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute('href', '/');
    expect(canvas.queryByRole('heading', { name: TITLE })).not.toBeInTheDocument();
    expect(
      canvas.queryByText(MEDIA_USE_PERMISSION_LABELS[MediaUsePermission.EDIT]),
    ).not.toBeInTheDocument();
  },
};
