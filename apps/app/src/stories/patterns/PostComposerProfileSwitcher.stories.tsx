import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostComposerProfileSwitcher } from '@/components/post/PostComposerProfileSwitcher';
import { PostComposerTarget } from '@/components/post/PostComposerTarget';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { composerMedia } from './PostComposer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerMediaItem } from '@/components/post/PostComposerMediaControls';
import type { ProfilePickerProfile } from '@/components/profile/ProfilePicker';

export const composerProfiles: readonly ProfilePickerProfile[] = [
  {
    avatar: null,
    displayName: '코스모 작가',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
  },
  {
    avatar: null,
    displayName: '먼 우주의 사용자',
    id: 'profile-remote',
    relativeHandle: '@remote',
  },
];

const draftMedia = [composerMedia[1]] as readonly ComposerMediaItem[];
const globalProfile = composerProfiles[0]!;

type ComposerProfileFixtureProps = Readonly<{
  onSelectProfile?: (id: string) => void | Promise<void>;
  surface: 'overlay' | 'rail';
}>;

export function ComposerProfileFixture({
  onSelectProfile = async () => undefined,
  surface,
}: ComposerProfileFixtureProps) {
  const theme = useTheme();
  const [body, setBody] = useState('프로필을 바꿔도 유지되는 본문');
  const [contentWarning, setContentWarning] = useState('콘텐츠 경고');
  const [contentWarningExpanded, setContentWarningExpanded] = useState(true);
  const [items, setItems] = useState(draftMedia);
  const sensitiveMedia = true;
  const [visibility, setVisibility] = useState<'FOLLOWERS' | 'PUBLIC' | 'UNLISTED'>('UNLISTED');
  const remaining =
    postBodyMaxLength -
    normalizePostContentPlainText(body).length -
    normalizePostContentPlainText(contentWarning).length;

  return (
    <View style={styles.fixture}>
      <View accessibilityLabel="전역 활성 프로필" style={styles.globalProfile}>
        <Text style={[styles.globalLabel, { color: theme.textSecondary }]}>전역 활성 프로필</Text>
        <Text style={[styles.globalName, { color: theme.text }]}>
          {globalProfile.displayName} {globalProfile.relativeHandle}
        </Text>
      </View>
      <PostComposerTarget
        author={
          <PostComposerProfileSwitcher
            onSelectProfile={onSelectProfile}
            profiles={composerProfiles}
            selectedProfileId={globalProfile.id}
            surface={surface}
          />
        }
        body={body}
        contentWarning={contentWarning}
        contentWarningExpanded={contentWarningExpanded}
        items={items}
        onBodyChange={setBody}
        onContentWarningChange={setContentWarning}
        onContentWarningToggle={() => setContentWarningExpanded((value) => !value)}
        onEmojiAction={fn()}
        onExpand={fn()}
        onMediaAction={fn()}
        onMediaEdit={fn()}
        onMediaRemove={(itemId) => setItems((value) => value.filter((item) => item.key !== itemId))}
        onMediaRetry={fn()}
        onPollAction={fn()}
        onSubmit={fn()}
        onVisibilityChange={setVisibility}
        remaining={remaining}
        sensitiveMedia={sensitiveMedia}
        showPollAction={false}
        surface={surface}
        visibility={visibility}
      />
    </View>
  );
}

function DeferredSelectionFixture({
  onSelectProfile,
  surface,
}: Required<ComposerProfileFixtureProps>) {
  const resolveRef = useRef<(() => void) | null>(null);
  const deferSelection = (id: string) =>
    new Promise<void>((resolve, reject) => {
      resolveRef.current = () => {
        resolveRef.current = null;
        void Promise.resolve(onSelectProfile(id)).then(resolve, reject);
      };
    });

  return (
    <>
      <ComposerProfileFixture onSelectProfile={deferSelection} surface={surface} />
      <Pressable
        accessibilityLabel="지연된 프로필 전환 완료"
        accessibilityRole="button"
        onPress={() => resolveRef.current?.()}
      >
        <Text>지연된 프로필 전환 완료</Text>
      </Pressable>
    </>
  );
}

function FailingSelectionFixture({
  onSelectProfile,
  surface,
}: Required<ComposerProfileFixtureProps>) {
  const failSelection = async (id: string) => {
    await onSelectProfile(id);
    throw new Error('selection failed');
  };

  return <ComposerProfileFixture onSelectProfile={failSelection} surface={surface} />;
}

const meta = {
  args: { onSelectProfile: fn(), surface: 'rail' },
  argTypes: {
    onSelectProfile: { action: 'selectProfile', control: false },
    surface: { control: 'inline-radio', options: ['rail', 'overlay'] },
  },
  component: ComposerProfileFixture,
  excludeStories: ['InteractionContract', 'PendingSelectionContract', 'FailureAndCancelContract'],
  parameters: { layout: 'centered' },
  title: 'KOSMO/Patterns/Post Composer Profile Switcher',
} satisfies Meta<typeof ComposerProfileFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['surface'] },
  },
};

export const Rail: Story = { args: { surface: 'rail' } };
export const Overlay: Story = { args: { surface: 'overlay' } };
export const Mobile390: Story = {
  args: { surface: 'overlay' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
};
export const Dark: Story = {
  args: { surface: 'overlay' },
  globals: { theme: 'dark' },
};

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onSelectProfile?.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });
    const body = canvas.getByRole('textbox', { name: '게시물 내용' });
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(contentWarning).toHaveValue('콘텐츠 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 1개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 1 ALT 편집' })).toBeVisible();
    expect(
      canvas.getByRole('button', { name: '첨부 이미지 1 민감한 이미지 설정 편집' }),
    ).toBeVisible();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const picker = await canvas.findByLabelText('프로필 전환');
    const selected = within(picker).getByRole('button', { name: '코스모 작가, @kosmo' });
    const remote = within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(remote).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(remote);
    await waitFor(() => expect(trigger).toHaveTextContent('먼 우주의 사용자'));
    expect(args.onSelectProfile).toHaveBeenCalledOnce();
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-remote');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(contentWarning).toHaveValue('콘텐츠 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 1개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 1 ALT 편집' })).toBeVisible();
    expect(
      canvas.getByRole('button', { name: '첨부 이미지 1 민감한 이미지 설정 편집' }),
    ).toBeVisible();
    expect(canvas.getByLabelText('전역 활성 프로필')).toHaveTextContent('코스모 작가 @kosmo');
  },
};

export const PendingSelectionContract: Story = {
  args: { onSelectProfile: fn(), surface: 'rail' },
  render: (args) => (
    <DeferredSelectionFixture onSelectProfile={args.onSelectProfile!} surface={args.surface!} />
  ),
  play: async ({ args, canvasElement }) => {
    args.onSelectProfile?.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });

    await userEvent.click(trigger);
    const remote = await canvas.findByRole('button', { name: '먼 우주의 사용자, @remote' });
    await userEvent.click(remote);
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(remote).toBeDisabled();
    expect(canvas.getByRole('button', { name: '코스모 작가, @kosmo' })).toBeDisabled();
    expect(args.onSelectProfile).not.toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: '지연된 프로필 전환 완료' }));
    await waitFor(() => expect(args.onSelectProfile).toHaveBeenCalledOnce());
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-remote');
    await waitFor(() => expect(trigger).not.toBeDisabled());
    expect(trigger).toHaveFocus();
  },
};

export const FailureAndCancelContract: Story = {
  args: { onSelectProfile: fn(), surface: 'overlay' },
  render: (args) => (
    <FailingSelectionFixture onSelectProfile={args.onSelectProfile!} surface={args.surface!} />
  ),
  play: async ({ args, canvasElement }) => {
    args.onSelectProfile?.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });
    const body = canvas.getByRole('textbox', { name: '게시물 내용' });

    await userEvent.click(trigger);
    const picker = await canvas.findByLabelText('프로필 전환');
    await userEvent.click(
      within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' }),
    );
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 전환하지 못했습니다.',
    );
    expect(trigger).toHaveTextContent('코스모 작가');
    expect(within(picker).getByRole('button', { name: '코스모 작가, @kosmo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(args.onSelectProfile).toHaveBeenCalledOnce();
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');

    await userEvent.keyboard('{Escape}');
    expect(canvas.queryByLabelText('프로필 전환')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(canvas.getByLabelText('전역 활성 프로필')).toHaveTextContent('코스모 작가 @kosmo');
  },
};

const styles = {
  fixture: { gap: spacing.lg, maxWidth: 600, padding: spacing.lg, width: '100%' },
  globalProfile: { gap: spacing.xs },
  globalLabel: { fontFamily: 'SUIT', ...typography.xsm },
  globalName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
} as const;
