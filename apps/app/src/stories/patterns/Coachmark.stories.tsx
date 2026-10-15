import { useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { Coachmark } from '@/components/ui/Coachmark';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { View as NativeView } from 'react-native';
import type { CoachmarkProps } from '@/components/ui/Coachmark';

type StoryArgs = Pick<CoachmarkProps, 'description' | 'title' | 'visible'> & {
  onBackgroundPress: () => void;
  onClose: () => void;
  onComplete: () => void;
};

type CoachmarkFixtureProps = StoryArgs & {
  updateArgs?: (update: Partial<StoryArgs>) => void;
};

function CoachmarkFixture({
  description,
  onBackgroundPress,
  onClose,
  onComplete,
  title,
  updateArgs,
  visible,
}: CoachmarkFixtureProps) {
  const anchorRef = useRef<NativeView>(null);
  const [localVisible, setLocalVisible] = useState(visible);

  const setVisible = (nextVisible: boolean) => {
    updateArgs?.({ visible: nextVisible });
    setLocalVisible(nextVisible);
  };

  const close = () => {
    onClose();
    setVisible(false);
  };

  return (
    <View style={styles.stage}>
      <View style={styles.controls}>
        <Button controlRef={anchorRef} onPress={() => setVisible(true)}>
          안내 열기
        </Button>
        <Button onPress={onBackgroundPress} tone="secondary">
          배경 동작
        </Button>
      </View>
      <Coachmark
        anchorRef={anchorRef}
        description={description}
        title={title}
        onClose={close}
        onComplete={() => {
          onComplete();
          setVisible(false);
        }}
        visible={updateArgs ? visible : localVisible}
      />
    </View>
  );
}

function StepsFixture({ onClose, onComplete }: Pick<StoryArgs, 'onClose' | 'onComplete'>) {
  const anchorRefs = [
    useRef<NativeView>(null),
    useRef<NativeView>(null),
    useRef<NativeView>(null),
  ] as const;
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const steps = [
    { description: '프로필을 열어 공개 범위를 확인하세요.', title: '프로필 확인' },
    { description: '표시할 항목을 고르고 순서를 바꿀 수 있어요.', title: '항목 선택' },
    { description: '설정을 저장해 안내를 마치세요.', title: '저장 완료' },
  ];
  const current = steps[step]!;
  const anchorRef = anchorRefs[step];
  const close = () => {
    onClose();
    setVisible(false);
  };

  return (
    <View style={styles.stage}>
      {anchorRefs.map((ref, index) => (
        <Button
          controlRef={ref}
          key={steps[index]!.title}
          testID={`coachmark-step-target-${index}`}
        >
          {`${steps[index]!.title} 대상`}
        </Button>
      ))}
      <Coachmark
        anchorRef={anchorRef}
        description={current.description}
        title={current.title}
        onClose={close}
        onPrevious={step > 0 ? () => setStep((value) => value - 1) : undefined}
        onNext={step < steps.length - 1 ? () => setStep((value) => value + 1) : undefined}
        onComplete={() => {
          onComplete();
          setVisible(false);
        }}
        visible={visible}
      >
        <Text
          accessibilityLabel={`${step + 1} / ${steps.length}단계`}
          style={[textStyles.uiCopyS, { lineHeight: textStyles.uiCopyM.lineHeight }]}
        >
          {`${step + 1} / ${steps.length}`}
        </Text>
      </Coachmark>
    </View>
  );
}

function LongContentFixture({
  onClose,
  onComplete,
  targetPosition = 'edge',
}: Pick<StoryArgs, 'onClose' | 'onComplete'> & { targetPosition?: 'edge' | 'lower' }) {
  const anchorRef = useRef<NativeView>(null);
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const close = () => {
    onClose();
    setVisible(false);
  };
  const description = Array.from(
    { length: 40 },
    (_, index) => `${index + 1}번째 안내를 확인하세요.`,
  ).join('\n');

  return (
    <View
      style={[
        targetPosition === 'lower' ? styles.lowerStage : styles.edgeStage,
        { minHeight: height },
      ]}
    >
      <Button
        controlRef={anchorRef}
        onPress={() => setVisible(true)}
        style={targetPosition === 'lower' ? styles.lowerTarget : undefined}
      >
        화면 끝 대상
      </Button>
      <Coachmark
        anchorRef={anchorRef}
        description={description}
        onClose={close}
        onComplete={() => {
          onComplete();
          setVisible(false);
        }}
        visible={visible}
      />
    </View>
  );
}

function SharedAnchorFixture({ onClose, onComplete }: Pick<StoryArgs, 'onClose' | 'onComplete'>) {
  const anchorRef = useRef<NativeView>(null);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  return (
    <View style={styles.stage}>
      <Button
        key={step}
        controlRef={anchorRef}
        testID="shared-anchor-target"
        style={{ marginTop: step * space[48] }}
      >
        안내 대상
      </Button>
      <Coachmark
        anchorRef={anchorRef}
        visible={visible}
        description="공용 대상 안내"
        onClose={() => {
          onClose();
          setVisible(false);
        }}
        onComplete={() => {
          onComplete();
          setVisible(false);
        }}
        onNext={step === 0 ? () => setStep(1) : undefined}
      >
        {step === 0 ? 0 : '1 / 2'}
      </Coachmark>
    </View>
  );
}

const meta = {
  args: {
    description: '여기서 프로필을 바꿀 수 있어요.',
    title: '프로필 전환',
    onBackgroundPress: fn(),
    onClose: fn(),
    onComplete: fn(),
    visible: false,
  },
  argTypes: {
    description: { control: 'text' },
    title: { control: 'text' },
    visible: { control: 'boolean' },
  },
  component: CoachmarkFixture,
  excludeStories: [
    'SharedAnchorContract',
    'Mobile320Contract',
    'Mobile360Contract',
    'Mobile390Contract',
    'TextScaleContract',
    'CompactContentContract',
    'CompactViewportContract',
    'InteractionContract',
    'PlacementContract',
    'StepsInteraction',
    'ViewportContract',
  ],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  title: 'KOSMO/Patterns/Coachmark',
} satisfies Meta<typeof CoachmarkFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs();
    return <CoachmarkFixture {...args} updateArgs={updateArgs} />;
  },
  parameters: {
    controls: { disable: false, include: ['description', 'title', 'visible'] },
  },
};

export const Steps: Story = {
  render: (args) => <StepsFixture onClose={args.onClose} onComplete={args.onComplete} />,
};

export const LongContent: Story = {
  render: (args) => <LongContentFixture onClose={args.onClose} onComplete={args.onComplete} />,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onComplete.mockClear();
    args.onClose.mockClear();
    args.onBackgroundPress.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '안내 열기' });
    trigger.focus();
    await userEvent.click(trigger);

    const surface = await screen.findByTestId('coachmark-surface');
    const close = within(surface).getByRole('button', { name: '완료' });
    await waitFor(() => expect(close).toHaveFocus());
    const background = canvas.getByRole('button', { name: '배경 동작' });
    const backgroundRect = background.getBoundingClientRect();
    const hitTarget = canvasElement.ownerDocument.elementFromPoint(
      backgroundRect.left + backgroundRect.width / 2,
      backgroundRect.top + backgroundRect.height / 2,
    );
    expect(hitTarget?.closest('[data-testid="coachmark-backdrop"]')).not.toBeNull();
    await userEvent.click(hitTarget as HTMLElement);
    expect(args.onBackgroundPress).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
    expect(args.onClose).toHaveBeenCalledOnce();

    args.onClose.mockClear();
    await userEvent.click(trigger);
    const reopenedSurface = await screen.findByTestId('coachmark-surface');
    await waitFor(() =>
      expect(within(reopenedSurface).getByRole('button', { name: '완료' })).toHaveFocus(),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
    expect(args.onClose).toHaveBeenCalledOnce();
  },
};

export const CompactContentContract: Story = {
  args: { description: '글을 저장하세요.', title: '' },
  play: async ({ args, canvasElement }) => {
    args.onClose.mockClear();
    args.onComplete.mockClear();
    const trigger = within(canvasElement).getByRole('button', { name: '안내 열기' });
    await userEvent.click(trigger);
    const surface = await screen.findByTestId('coachmark-surface');
    expect(screen.getByRole('dialog', { name: '글을 저장하세요.' })).toBeVisible();
    expect(within(surface).queryByRole('heading')).not.toBeInTheDocument();
    expect(within(surface).getAllByRole('button')).toHaveLength(2);
    await waitFor(() => {
      const rect = surface.getBoundingClientRect();
      expect(rect.width).toBeLessThan(256);
      expect(rect.height).toBeLessThan(120);
    });
    await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
    expect(args.onComplete).toHaveBeenCalledOnce();
    expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    const reopened = await screen.findByTestId('coachmark-surface');
    await userEvent.click(within(reopened).getByRole('button', { name: '건너뛰기' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
    expect(args.onClose).toHaveBeenCalledOnce();
    expect(args.onComplete).toHaveBeenCalledOnce();
  },
};

export const StepsInteraction: Story = {
  render: (args) => <StepsFixture onClose={args.onClose} onComplete={args.onComplete} />,
  play: async ({ args, canvasElement }) => {
    args.onComplete.mockClear();
    args.onClose.mockClear();
    const canvas = within(canvasElement);
    const assertArrowMatchesTarget = async (index: number) => {
      const target = canvas.getByTestId(`coachmark-step-target-${index}`);
      const arrow = await screen.findByTestId('coachmark-arrow');
      await waitFor(() => {
        const targetRect = target.getBoundingClientRect();
        const arrowRect = arrow.getBoundingClientRect();
        expect(
          Math.abs(arrowRect.left + arrowRect.width / 2 - (targetRect.left + targetRect.width / 2)),
        ).toBeLessThanOrEqual(2);
      });
    };

    const surface = await screen.findByTestId('coachmark-surface');
    await assertArrowMatchesTarget(0);
    const previous = within(surface).getByRole('button', { name: '이전' });
    const next = within(surface).getByRole('button', { name: '다음' });
    expect(previous).toBeDisabled();
    const previousRect = previous.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    expect(nextRect.left - previousRect.right).toBeLessThanOrEqual(1);
    expect(previousRect.height).toBe(nextRect.height);
    await userEvent.click(next);
    expect(await screen.findByRole('dialog', { name: '항목 선택' })).toBeVisible();
    await assertArrowMatchesTarget(1);
    await waitFor(() =>
      expect(within(surface).getByRole('button', { name: '다음' })).toHaveFocus(),
    );
    const longBody = await screen.findByTestId('coachmark-body');
    await waitFor(() => expect(longBody.scrollHeight).toBeLessThanOrEqual(longBody.clientHeight));
    await userEvent.click(within(surface).getByRole('button', { name: '이전' }));
    await assertArrowMatchesTarget(0);
    await userEvent.click(within(surface).getByRole('button', { name: '다음' }));
    await assertArrowMatchesTarget(1);
    await userEvent.click(
      within(await screen.findByTestId('coachmark-surface')).getByRole('button', { name: '다음' }),
    );
    await assertArrowMatchesTarget(2);
    const shortBody = await screen.findByTestId('coachmark-body');
    await waitFor(() => expect(shortBody.scrollHeight).toBeLessThanOrEqual(shortBody.clientHeight));
    await userEvent.click(
      within(await screen.findByTestId('coachmark-surface')).getByRole('button', { name: '완료' }),
    );
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
    expect(args.onComplete).toHaveBeenCalledOnce();
    expect(args.onClose).not.toHaveBeenCalled();
    void canvasElement;
  },
};

export const SharedAnchorContract: Story = {
  render: (args) => <SharedAnchorFixture onClose={args.onClose} onComplete={args.onComplete} />,
  play: async ({ canvasElement }) => {
    const surface = await screen.findByTestId('coachmark-surface');
    expect(within(surface).getByText('0')).toBeVisible();
    await userEvent.click(within(surface).getByRole('button', { name: '다음' }));
    const target = within(canvasElement).getByTestId('shared-anchor-target');
    const arrow = await screen.findByTestId('coachmark-arrow');
    await waitFor(() => {
      const targetRect = target.getBoundingClientRect();
      const arrowRect = arrow.getBoundingClientRect();
      expect(
        Math.abs(arrowRect.top + arrowRect.height / 2 - (targetRect.bottom + 12)),
      ).toBeLessThanOrEqual(2);
    });
    expect(within(surface).getByText('1 / 2')).toBeVisible();
    await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
  },
};

export const ViewportContract: Story = {
  render: (args) => <LongContentFixture onClose={args.onClose} onComplete={args.onComplete} />,
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ canvasElement }) => {
    const surface = await screen.findByTestId('coachmark-surface');
    await waitFor(() => {
      const rect = surface.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
    const body = await screen.findByTestId('coachmark-body');
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    expect(within(surface).getByRole('button', { name: '완료' })).toBeVisible();
    void canvasElement;
  },
};

export const PlacementContract: Story = {
  render: (args) => (
    <LongContentFixture
      onClose={args.onClose}
      onComplete={args.onComplete}
      targetPosition="lower"
    />
  ),
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async () => {
    const target = await screen.findByRole('button', { name: '화면 끝 대상' });
    const surface = await screen.findByTestId('coachmark-surface');
    const arrow = await screen.findByTestId('coachmark-arrow');
    await waitFor(() => {
      const targetRect = target.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const arrowRect = arrow.getBoundingClientRect();
      expect(window.innerHeight - targetRect.bottom).toBeGreaterThan(28);
      expect(surfaceRect.bottom).toBeLessThanOrEqual(targetRect.top);
      expect(
        Math.abs(arrowRect.left + arrowRect.width / 2 - (targetRect.left + targetRect.width / 2)),
      ).toBeLessThanOrEqual(2);
    });
  },
};

export const CompactViewportContract: Story = {
  globals: { viewport: { isRotated: false, value: 'coachmarkCompact' } },
  parameters: {
    viewport: {
      options: {
        coachmarkCompact: {
          name: 'Coachmark compact',
          styles: { height: '240px', width: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  render: (args) => <LongContentFixture onClose={args.onClose} onComplete={args.onComplete} />,
  play: async () => {
    expect(window.innerWidth).toBe(320);
    expect(window.innerHeight).toBe(240);

    const surface = await screen.findByTestId('coachmark-surface');
    const body = await screen.findByTestId('coachmark-body');
    await waitFor(() => {
      const rect = surface.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
      expect(body.clientHeight).toBeGreaterThan(0);
    });

    await waitFor(() => expect(body.scrollHeight).toBeGreaterThan(body.clientHeight));
    body.focus();
    await userEvent.keyboard('{End}');
    await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
  },
};

const mobileViewports = {
  coachmark320: {
    name: 'Coachmark 320',
    styles: { width: '320px', height: '568px' },
    type: 'mobile',
  },
  coachmark360: {
    name: 'Coachmark 360',
    styles: { width: '360px', height: '800px' },
    type: 'mobile',
  },
  coachmark390: {
    name: 'Coachmark 390',
    styles: { width: '390px', height: '844px' },
    type: 'mobile',
  },
};

export const Mobile320: Story = {
  args: { visible: true },
  globals: { viewport: { isRotated: false, value: 'coachmark320' } },
  parameters: { viewport: { options: mobileViewports } },
};
export const Mobile360: Story = {
  ...Mobile320,
  globals: { viewport: { isRotated: false, value: 'coachmark360' } },
};
export const Mobile390: Story = {
  ...Mobile320,
  globals: { viewport: { isRotated: false, value: 'coachmark390' } },
};
export const LongerMessage: Story = {
  ...Mobile320,
  args: {
    description: '프로필 메뉴에서 다른 프로필로 전환하거나 새 프로필을 추가할 수 있어요.',
    visible: true,
  },
};

const mobileContract: Story['play'] = async () => {
  const surface = await screen.findByTestId('coachmark-surface');
  await waitFor(() => {
    const rect = surface.getBoundingClientRect();
    expect(rect.width).toBeLessThanOrEqual(256);
    expect(rect.left).toBeGreaterThanOrEqual(16);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth - 16);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight - 16);
    const body = screen.getByTestId('coachmark-body');
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  });
  await userEvent.click(within(surface).getByRole('button', { name: '완료' }));
  await waitFor(() => expect(screen.queryByTestId('coachmark-surface')).not.toBeInTheDocument());
};
export const Mobile320Contract: Story = {
  ...Mobile320,
  play: async (context) => {
    expect(window.innerWidth).toBe(320);
    await mobileContract(context);
  },
};
export const Mobile360Contract: Story = {
  ...Mobile360,
  play: async (context) => {
    expect(window.innerWidth).toBe(360);
    await mobileContract(context);
  },
};
export const Mobile390Contract: Story = {
  ...Mobile390,
  play: async (context) => {
    expect(window.innerWidth).toBe(390);
    await mobileContract(context);
  },
};
export const TextScaleContract: Story = {
  ...LongerMessage,
  play: async (context) => {
    const surface = await screen.findByTestId('coachmark-surface');
    const text = within(surface).getByText(context.args.description);
    const before = text.getBoundingClientRect().height;
    const computed = getComputedStyle(text);
    // Web text-only 200% probe; this does not simulate Native Dynamic Type.
    text.style.fontSize = `${parseFloat(computed.fontSize) * 2}px`;
    text.style.lineHeight = `${parseFloat(computed.lineHeight) * 2}px`;
    await waitFor(() => expect(text.getBoundingClientRect().height).toBeGreaterThan(before));
    expect(within(surface).getByRole('button', { name: '완료' })).toBeVisible();
    await mobileContract(context);
  },
};

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  edgeStage: { flex: 1, justifyContent: 'flex-end', padding: space[16], width: '100%' },
  lowerTarget: { marginTop: 560 },
  lowerStage: { flex: 1, padding: space[16], width: '100%' },
  stage: { flex: 1, gap: space[16], padding: space[16], width: '100%' },
});
