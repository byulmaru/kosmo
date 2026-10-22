import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  MobileFullscreenComposerShellCandidate,
  PostComposer,
} from '@/components/post/PostComposer';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    author: <Text>테스트 작성자</Text>,
    body: '',
    contentWarning: '',
    contentWarningExpanded: false,
    items: [],
    onBodyChange: fn(),
    onContentWarningChange: fn(),
    onContentWarningToggle: fn(),
    onEmojiAction: fn(),
    onExpand: fn(),
    onMediaAction: fn(),
    onMediaEdit: fn(),
    onMediaRemove: fn(),
    onMediaRetry: fn(),
    onPollAction: fn(),
    onSelectionChange: fn(),
    onSubmit: fn(),
    onVisibilityChange: fn(),
    remaining: 500,
    selection: { end: 0, start: 0 },
    sensitiveMedia: false,
    surface: 'rail',
    visibility: 'UNLISTED',
  },
  component: PostComposer,
  globals: { viewport: { isRotated: false, value: 'railMinimum' } },
  parameters: {
    controls: { disable: true },
    layout: 'padded',
    viewport: {
      options: {
        railMinimum: {
          name: 'Full Web 1280',
          styles: { height: '900px', width: '1280px' },
          type: 'desktop',
        },
        railWide: {
          name: 'Full Web 1440',
          styles: { height: '900px', width: '1440px' },
          type: 'desktop',
        },
      },
    },
  },
  render: (args) => {
    const [visibility, setVisibility] = useState(args.visibility);
    return (
      <View style={{ width: args.surface === 'rail' ? 320 : 640 }}>
        <PostComposer
          {...args}
          onVisibilityChange={(value) => {
            args.onVisibilityChange(value);
            setVisibility(value);
          }}
          visibility={visibility}
        />
      </View>
    );
  },
  title: 'KOSMO/Components/Post Composer Visibility/Tests',
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function expectFullLabel(trigger: HTMLElement, text: string) {
  const label = within(trigger).getByText(text);
  expect(label).toBeVisible();
  expect(label.clientWidth).toBeGreaterThan(0);
  expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
  const range = label.ownerDocument.createRange();
  range.selectNodeContents(label);
  const textBounds = range.getBoundingClientRect();
  const labelBounds = label.getBoundingClientRect();
  const triggerBounds = trigger.getBoundingClientRect();
  expect(textBounds.left).toBeGreaterThanOrEqual(labelBounds.left - 1);
  expect(textBounds.right).toBeLessThanOrEqual(labelBounds.right + 1);
  expect(labelBounds.left).toBeGreaterThanOrEqual(triggerBounds.left);
  expect(labelBounds.right).toBeLessThanOrEqual(triggerBounds.right);
  return labelBounds;
}

export const DirectSelection: Story = {
  play: async ({ args, canvasElement }) => {
    args.onVisibilityChange.mockClear();
    args.onExpand.mockClear();
    const canvas = within(canvasElement);
    await canvasElement.ownerDocument.fonts.ready;
    const target = canvas.getByTestId('post-composer-target');
    const expand = canvas.getByRole('button', { name: 'Composer 확장' });
    expect(target.getBoundingClientRect().width).toBe(320);

    for (const [value, label] of [
      ['DIRECT', '언급한 프로필만'],
      ['PUBLIC', '공개'],
      ['UNLISTED', '조용한 공개'],
      ['FOLLOWERS', '팔로워만'],
    ] as const) {
      await userEvent.click(canvas.getByRole('button', { name: /^공개 범위:/ }));
      await userEvent.click(canvas.getByRole('menuitemradio', { name: label }));
      expect(args.onVisibilityChange).toHaveBeenLastCalledWith(value);
      expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();

      const trigger = canvas.getByRole('button', { name: `공개 범위: ${label}` });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
      const labelBounds = expectFullLabel(trigger, label);
      const icon = trigger.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon!.getBoundingClientRect().right).toBeLessThanOrEqual(labelBounds.left);
      const targetBounds = target.getBoundingClientRect();
      const triggerBounds = trigger.getBoundingClientRect();
      const expandBounds = expand.getBoundingClientRect();
      expect(triggerBounds.left).toBeGreaterThanOrEqual(targetBounds.left);
      expect(triggerBounds.right).toBeLessThanOrEqual(expandBounds.left);
      expect(expandBounds.right).toBeLessThanOrEqual(targetBounds.right);
      expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);

      await userEvent.click(trigger);
      expect(canvas.getByRole('menuitemradio', { name: label })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await userEvent.keyboard('{Escape}');
      expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();
      expect(trigger).toHaveFocus();
    }
    await userEvent.click(expand);
    expect(args.onExpand).toHaveBeenCalledOnce();
  },
};

export const RailLabelsWide: Story = {
  ...DirectSelection,
  globals: { viewport: { isRotated: false, value: 'railWide' } },
};

export const KeyboardSelection: Story = {
  play: async ({ args, canvasElement }) => {
    args.onVisibilityChange.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' }));
    expect(canvas.getByRole('menuitemradio', { name: '조용한 공개' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(canvas.getByRole('menuitemradio', { name: '언급한 프로필만' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const direct = canvas.getByRole('button', { name: '공개 범위: 언급한 프로필만' });
    expect(direct).toHaveFocus();
    expect(args.onVisibilityChange).toHaveBeenLastCalledWith('DIRECT');
    expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();
    await userEvent.click(direct);
    await userEvent.keyboard('{Home}');
    expect(canvas.getByRole('menuitemradio', { name: '공개' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(canvas.getByRole('menuitemradio', { name: '팔로워만' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(canvas.getByRole('menuitemradio', { name: '조용한 공개' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(canvas.getByRole('button', { name: '공개 범위: 조용한 공개' })).toHaveFocus();
    expect(args.onVisibilityChange).toHaveBeenLastCalledWith('UNLISTED');
    expect(canvas.queryByRole('menu', { name: '공개 범위 선택' })).toBeNull();
  },
};

export const OverlayDirectLabel: Story = {
  args: { surface: 'overlay', visibility: 'DIRECT' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvasElement.ownerDocument.fonts.ready;
    const trigger = canvas.getByRole('button', { name: '공개 범위: 언급한 프로필만' });
    const labelBounds = expectFullLabel(trigger, '언급한 프로필만');
    const caption = within(trigger).getByText('공개 범위');
    expect(caption.getBoundingClientRect().right).toBeLessThanOrEqual(labelBounds.left);
    const chevron = trigger.querySelector('svg');
    expect(chevron).not.toBeNull();
    expect(labelBounds.right).toBeLessThanOrEqual(chevron!.getBoundingClientRect().left);
  },
};

export const MobileDirectLabel: Story = {
  ...OverlayDirectLabel,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: (args) => (
    <MobileFullscreenComposerShellCandidate {...args} onOverlayClose={() => undefined} />
  ),
};
