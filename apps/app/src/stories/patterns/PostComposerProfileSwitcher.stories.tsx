import { normalizePostContentPlainText } from '@kosmo/core/post-content';
import { postBodyMaxLength } from '@kosmo/core/validation/post-policy';
import { useEffect, useRef, useState } from 'react';
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
  body: string;
  contentWarning: string;
  contentWarningExpanded: boolean;
  items: readonly ComposerMediaItem[];
  onSelectProfile?: (id: string) => void | Promise<void>;
  selectedProfileId: string;
  sensitiveMedia: boolean;
  surface: 'overlay' | 'rail';
  switching: boolean;
}>;

type SelectionFixtureProps = Readonly<{
  onSelectProfile: (id: string) => void | Promise<void>;
  surface: 'overlay' | 'rail';
}>;

const defaultFixtureArgs = {
  body: '프로필을 바꿔도 유지되는 본문',
  contentWarning: '콘텐츠 경고',
  contentWarningExpanded: true,
  items: draftMedia,
  selectedProfileId: globalProfile.id,
  sensitiveMedia: true,
  surface: 'rail',
  switching: false,
} satisfies Omit<ComposerProfileFixtureProps, 'onSelectProfile'>;

export function ComposerProfileFixture({
  body: initialBody,
  contentWarning: initialContentWarning,
  contentWarningExpanded: initialContentWarningExpanded,
  items: initialItems,
  onSelectProfile = async () => undefined,
  selectedProfileId: initialSelectedProfileId,
  sensitiveMedia: initialSensitiveMedia,
  surface,
  switching,
}: ComposerProfileFixtureProps) {
  const theme = useTheme();
  const switchingRef = useRef(switching);
  const resolveSelectionRef = useRef<(() => void) | null>(null);
  const [body, setBody] = useState(initialBody);
  const [contentWarning, setContentWarning] = useState(initialContentWarning);
  const [contentWarningExpanded, setContentWarningExpanded] = useState(
    initialContentWarningExpanded,
  );
  const [items, setItems] = useState(initialItems);
  const [sensitiveMedia, setSensitiveMedia] = useState(initialSensitiveMedia);
  const [visibility, setVisibility] = useState<'FOLLOWERS' | 'PUBLIC' | 'UNLISTED'>('UNLISTED');
  const remaining =
    postBodyMaxLength -
    normalizePostContentPlainText(body).length -
    normalizePostContentPlainText(contentWarning).length;

  useEffect(() => setBody(initialBody), [initialBody]);
  useEffect(() => setContentWarning(initialContentWarning), [initialContentWarning]);
  useEffect(
    () => setContentWarningExpanded(initialContentWarningExpanded),
    [initialContentWarningExpanded],
  );
  useEffect(() => setItems(initialItems), [initialItems]);
  useEffect(() => setSensitiveMedia(initialSensitiveMedia), [initialSensitiveMedia]);
  useEffect(() => {
    switchingRef.current = switching;
    if (!switching) {
      resolveSelectionRef.current?.();
      resolveSelectionRef.current = null;
    }
  }, [switching]);

  const selectProfile = async (id: string) => {
    await onSelectProfile(id);
    if (switchingRef.current) {
      await new Promise<void>((resolve) => {
        if (!switchingRef.current) {
          resolve();
          return;
        }
        resolveSelectionRef.current = resolve;
      });
    }
  };

  return (
    <View
      style={[
        styles.fixture,
        {
          maxWidth: '100%',
          width: surface === 'rail' ? 326 + spacing.lg * 2 : 600 + spacing.lg * 2,
        },
      ]}
    >
      <View accessibilityLabel="전역 활성 프로필" style={styles.globalProfile}>
        <Text style={[styles.globalLabel, { color: theme.textSecondary }]}>전역 활성 프로필</Text>
        <Text style={[styles.globalName, { color: theme.text }]}>
          {globalProfile.displayName} {globalProfile.relativeHandle}
        </Text>
      </View>
      <PostComposerTarget
        author={
          <PostComposerProfileSwitcher
            onSelectProfile={selectProfile}
            profiles={composerProfiles}
            selectedProfileId={initialSelectedProfileId}
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

function DeferredSelectionFixture({ onSelectProfile, surface }: SelectionFixtureProps) {
  const [switching, setSwitching] = useState(true);

  return (
    <>
      <ComposerProfileFixture
        {...defaultFixtureArgs}
        onSelectProfile={onSelectProfile}
        surface={surface}
        switching={switching}
      />
      <Pressable
        accessibilityLabel="지연된 프로필 전환 완료"
        accessibilityRole="button"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPress={() => setSwitching(false)}
      >
        <Text>지연된 프로필 전환 완료</Text>
      </Pressable>
    </>
  );
}

function FailingSelectionFixture({ onSelectProfile, surface }: SelectionFixtureProps) {
  const failSelection = async (id: string) => {
    await onSelectProfile(id);
    throw new Error('selection failed');
  };

  return (
    <ComposerProfileFixture
      {...defaultFixtureArgs}
      onSelectProfile={failSelection}
      surface={surface}
    />
  );
}

const meta = {
  args: { ...defaultFixtureArgs, onSelectProfile: fn() },
  argTypes: {
    body: { control: 'text' },
    contentWarning: { control: 'text' },
    contentWarningExpanded: { control: 'boolean' },
    items: { control: 'object' },
    onSelectProfile: { action: 'selectProfile', control: false },
    selectedProfileId: {
      control: 'select',
      options: composerProfiles.map((profile) => profile.id),
    },
    sensitiveMedia: { control: 'boolean' },
    surface: { control: 'inline-radio', options: ['rail', 'overlay'] },
    switching: {
      control: 'boolean',
      description: '선택한 프로필 전환을 완료하지 않고 전환 중 상태로 유지합니다.',
    },
  },
  component: ComposerProfileFixture,
  excludeStories: [
    'CancelSelectionContract',
    'FailureAndCancelContract',
    'InteractionContract',
    'PendingSelectionContract',
  ],
  parameters: { layout: 'centered' },
  title: 'KOSMO/Patterns/Post Composer Profile Switcher',
} satisfies Meta<typeof ComposerProfileFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'selectedProfileId',
        'body',
        'contentWarning',
        'contentWarningExpanded',
        'items',
        'sensitiveMedia',
        'switching',
        'surface',
      ],
    },
  },
};

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
  args: {
    body: 'Controls에서 설정한 본문',
    contentWarning: 'Controls에서 설정한 경고',
    contentWarningExpanded: true,
    items: composerMedia,
    selectedProfileId: 'profile-remote',
    sensitiveMedia: false,
    switching: false,
    surface: 'rail',
  },
  play: async ({ args, canvasElement }) => {
    args.onSelectProfile?.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });
    const target = canvas.getByTestId('post-composer-target');
    const body = canvas.getByRole('textbox', { name: '게시물 내용' });
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });

    expect(target.getBoundingClientRect().width).toBeCloseTo(326, 0);
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveValue('Controls에서 설정한 본문');
    expect(contentWarning).toHaveValue('Controls에서 설정한 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 3개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 2 ALT 편집' })).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: '첨부 이미지 2 민감한 이미지 설정 편집' }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByText('먼 우주의 사용자', { exact: true }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(canvas.getByText('@remote', { exact: true }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(canvas.getByLabelText('먼 우주의 사용자 프로필 이미지'));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const picker = await canvas.findByLabelText('프로필 전환');
    const kosmo = within(picker).getByRole('button', { name: '코스모 작가, @kosmo' });
    const remote = within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' });
    expect(kosmo).toHaveAttribute('aria-pressed', 'false');
    expect(remote).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(body);
    expect(canvas.queryByLabelText('프로필 전환')).not.toBeInTheDocument();
    await waitFor(() => expect(body).toHaveFocus());

    await userEvent.click(trigger);
    const reopenedPicker = await canvas.findByLabelText('프로필 전환');
    const reopenedKosmo = within(reopenedPicker).getByRole('button', {
      name: '코스모 작가, @kosmo',
    });

    await userEvent.click(reopenedKosmo);
    await waitFor(() => expect(canvas.getByText('코스모 작가', { exact: true })).toBeVisible());
    expect(args.onSelectProfile).toHaveBeenCalledOnce();
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-kosmo');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(body).toHaveValue('Controls에서 설정한 본문');
    expect(contentWarning).toHaveValue('Controls에서 설정한 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 3개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 2 ALT 편집' })).toBeVisible();
    expect(
      canvas.queryByRole('button', { name: '첨부 이미지 2 민감한 이미지 설정 편집' }),
    ).not.toBeInTheDocument();
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
    await waitFor(() => expect(args.onSelectProfile).toHaveBeenCalledOnce());
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-remote');

    await userEvent.click(canvas.getByRole('button', { name: '지연된 프로필 전환 완료' }));
    await waitFor(() => expect(trigger).not.toBeDisabled());
    await waitFor(() => expect(trigger).toHaveFocus());
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
    expect(canvas.getByTestId('post-composer-target').getBoundingClientRect().width).toBeCloseTo(
      600,
      0,
    );
    const body = canvas.getByRole('textbox', { name: '게시물 내용' });

    await userEvent.click(trigger);
    const picker = await canvas.findByLabelText('프로필 전환');
    await userEvent.click(
      within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' }),
    );
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '프로필을 전환하지 못했습니다.',
    );
    expect(trigger).toBeVisible();
    expect(within(picker).getByRole('button', { name: '코스모 작가, @kosmo' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(args.onSelectProfile).toHaveBeenCalledOnce();
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');

    await userEvent.keyboard('{Escape}');
    expect(canvas.queryByLabelText('프로필 전환')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(canvas.getByLabelText('전역 활성 프로필')).toHaveTextContent('코스모 작가 @kosmo');
  },
};

export const CancelSelectionContract: Story = {
  args: { onSelectProfile: fn(), surface: 'overlay' },
  render: (args) => (
    <DeferredSelectionFixture onSelectProfile={args.onSelectProfile!} surface={args.surface!} />
  ),
  play: async ({ args, canvasElement }) => {
    args.onSelectProfile?.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '작성 프로필' });
    const body = canvas.getByRole('textbox', { name: '게시물 내용' });
    const contentWarning = canvas.getByRole('textbox', { name: '콘텐츠 경고' });

    await userEvent.click(trigger);
    const picker = await canvas.findByLabelText('프로필 전환');
    await userEvent.click(
      within(picker).getByRole('button', { name: '먼 우주의 사용자, @remote' }),
    );
    expect(trigger).toBeDisabled();
    await waitFor(() => expect(args.onSelectProfile).toHaveBeenCalledOnce());
    expect(args.onSelectProfile).toHaveBeenLastCalledWith('profile-remote');

    await userEvent.keyboard('{Escape}');
    expect(canvas.queryByLabelText('프로필 전환')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-busy', 'true');

    trigger.click();
    expect(canvas.queryByLabelText('프로필 전환')).not.toBeInTheDocument();

    await userEvent.click(body);
    await waitFor(() => expect(body).toHaveFocus());

    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(contentWarning).toHaveValue('콘텐츠 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 1개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 1 ALT 편집' })).toBeVisible();
    expect(
      canvas.getByRole('button', { name: '첨부 이미지 1 민감한 이미지 설정 편집' }),
    ).toBeVisible();
    expect(canvas.getByLabelText('전역 활성 프로필')).toHaveTextContent('코스모 작가 @kosmo');

    await userEvent.click(canvas.getByRole('button', { name: '지연된 프로필 전환 완료' }));
    await waitFor(() => expect(trigger).not.toBeDisabled());
    await waitFor(() => expect(body).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(body).toHaveValue('프로필을 바꿔도 유지되는 본문');
    expect(contentWarning).toHaveValue('콘텐츠 경고');
    expect(canvas.getByLabelText('첨부 이미지 갤러리, 1개')).toBeVisible();
    expect(canvas.getByRole('button', { name: '첨부 이미지 1 ALT 편집' })).toBeVisible();
    expect(
      canvas.getByRole('button', { name: '첨부 이미지 1 민감한 이미지 설정 편집' }),
    ).toBeVisible();
    expect(canvas.getByLabelText('전역 활성 프로필')).toHaveTextContent('코스모 작가 @kosmo');

    await userEvent.click(trigger);
    const pickerAfterLateResolve = await canvas.findByLabelText('프로필 전환');
    expect(
      within(pickerAfterLateResolve).getByRole('button', { name: '코스모 작가, @kosmo' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(pickerAfterLateResolve).getByRole('button', { name: '먼 우주의 사용자, @remote' }),
    ).toHaveAttribute('aria-pressed', 'false');
  },
};

const styles = {
  fixture: { gap: spacing.lg, maxWidth: 600, padding: spacing.lg, width: '100%' },
  globalProfile: { gap: spacing.xs },
  globalLabel: { fontFamily: 'SUIT', ...typography.xsm },
  globalName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
} as const;
