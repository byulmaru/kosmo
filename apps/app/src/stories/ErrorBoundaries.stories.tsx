import { usePathname } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AppProviders } from '@/components/AppProviders';
import { GraphQLErrorBoundary } from '@/components/GraphQLErrorBoundary';
import { RouteBoundary } from '@/components/RouteBoundary';
import { UnexpectedErrorScreen } from '@/components/UnexpectedErrorScreen';
import { StructuredClientError } from '@/observability/client-error';
import { SessionFailOpenBoundary } from '@/session/SessionProvider';
import { RouterMockProvider } from '../../.storybook/mocks/expo-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ErrorInfo } from 'react';
import type { Href } from '../../.storybook/mocks/expo-router';

const storyGlobal = globalThis as unknown as {
  process?: { env: Record<string, string | undefined> };
};
storyGlobal.process ??= { env: {} };

const unexpectedRenderError = new Error('production boundary fixture with a private path');
const expectedNetworkError = new StructuredClientError({
  code: 'NETWORK_REQUEST_FAILED',
  message: 'network down',
  origin: 'transport',
  type: 'network',
});

function ThrowOnRender({
  active,
  error = unexpectedRenderError,
}: {
  active: boolean;
  error?: Error;
}) {
  if (active) {
    throw error;
  }

  return <Text>콘텐츠가 복구됐습니다.</Text>;
}

function GraphQLBoundaryHarness({ onRetry }: { onRetry: () => void }) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary
      onRetry={() => {
        setFailed(false);
        onRetry();
      }}
    >
      <ThrowOnRender active={failed} />
    </GraphQLErrorBoundary>
  );
}

function RouteBoundaryHarness({
  onReport,
  onRetry,
}: {
  onReport: () => string;
  onRetry: () => void;
}) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary onError={onReport} onRetry={() => undefined}>
      <RouteBoundary
        loading={<Text>route loading</Text>}
        onRetry={() => {
          setFailed(false);
          onRetry();
        }}
        title="경로를 불러오지 못했어요"
      >
        <ThrowOnRender active={failed} error={expectedNetworkError} />
      </RouteBoundary>
    </GraphQLErrorBoundary>
  );
}

function SafeNavigationHarness({
  onNavigate,
  onReport,
  onRetry,
}: {
  onNavigate: () => void;
  onReport: () => string;
  onRetry: () => void;
}) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary
      onError={onReport}
      onRetry={onRetry}
      onSafeNavigate={() => {
        setFailed(false);
        onNavigate();
      }}
    >
      <ThrowOnRender active={failed} />
    </GraphQLErrorBoundary>
  );
}

function ReporterFallbackHarness({
  onReport,
}: {
  onReport: (error: unknown, info: ErrorInfo) => string | undefined;
}) {
  return (
    <GraphQLErrorBoundary onError={onReport} onRetry={() => undefined}>
      <ThrowOnRender active />
    </GraphQLErrorBoundary>
  );
}

function RetryReFailureHarness({ onReport }: { onReport: (eventId: string) => void }) {
  const [attempt, setAttempt] = useState(0);

  return (
    <GraphQLErrorBoundary
      onError={() => {
        const eventId = `event-${attempt + 1}`;
        onReport(eventId);
        return eventId;
      }}
      onRetry={() => setAttempt((current) => current + 1)}
    >
      <ThrowOnRender active error={new Error(`retry failure ${attempt}`)} />
    </GraphQLErrorBoundary>
  );
}

function SessionBoundaryHarness() {
  const [failed, setFailed] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  return (
    <GraphQLErrorBoundary onRetry={() => undefined}>
      <View>
        <Pressable
          accessibilityLabel="세션 갱신"
          accessibilityRole="button"
          onPress={() => {
            setFailed(false);
            setResetKey((current) => current + 1);
          }}
        >
          <Text>세션 갱신</Text>
        </Pressable>
        <SessionFailOpenBoundary fallback={<Text>세션 오류 상태</Text>} resetKey={resetKey}>
          <ThrowOnRender active={failed} />
        </SessionFailOpenBoundary>
      </View>
    </GraphQLErrorBoundary>
  );
}

function ProductionRouteFailure() {
  const pathname = usePathname();

  return (
    <View>
      <Text>{pathname}</Text>
      <ThrowOnRender active={pathname !== '/'} />
    </View>
  );
}

function ProductionAppProvidersHarness({
  onNavigate,
}: {
  onNavigate: (action: 'push' | 'replace', href: Href) => void;
}) {
  return (
    <RouterMockProvider onNavigate={onNavigate} pathname="/settings">
      <AppProviders>
        <ProductionRouteFailure />
      </AppProviders>
    </RouterMockProvider>
  );
}

function DeferredClipboardHarness() {
  const [visible, setVisible] = useState(true);
  const resolverRef = useRef<((copied: boolean) => void) | null>(null);
  const writeClipboard = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      }),
    [],
  );
  const resolveClipboard = () => {
    resolverRef.current?.(true);
    resolverRef.current = null;
  };

  return (
    <View>
      {visible ? (
        <UnexpectedErrorScreen
          eventId="event-deferred"
          onRetry={() => setVisible(false)}
          onSafeNavigate={() => setVisible(false)}
          writeClipboard={writeClipboard}
        />
      ) : (
        <Text>복구됐습니다.</Text>
      )}
      <Pressable
        accessibilityLabel="지연 복사 완료"
        accessibilityRole="button"
        onPress={resolveClipboard}
      >
        <Text>지연 복사 완료</Text>
      </Pressable>
    </View>
  );
}

const meta = {
  title: 'Foundation/Error Boundaries',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const graphQLRetry = fn();

export const GraphQLFallbackAndRetry: Story = {
  render: () => <GraphQLBoundaryHarness onRetry={graphQLRetry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('문제가 발생했어요')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(graphQLRetry).toHaveBeenCalledTimes(1);
  },
};

const routeRetry = fn();
const expectedRouteReporter = fn(() => 'unexpected-id');

export const RouteFallbackAndRetry: Story = {
  render: () => <RouteBoundaryHarness onReport={expectedRouteReporter} onRetry={routeRetry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('경로를 불러오지 못했어요');
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(routeRetry).toHaveBeenCalledTimes(1);
    expect(expectedRouteReporter).not.toHaveBeenCalled();
  },
};

const safeNavigationReporter = fn(() => 'event-current');
const safeNavigationOwnerRetry = fn();
const safeNavigation = fn();

export const SafeNavigationResetsWithoutOwnerRetry: Story = {
  render: () => (
    <SafeNavigationHarness
      onNavigate={safeNavigation}
      onReport={safeNavigationReporter}
      onRetry={safeNavigationOwnerRetry}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('event-current')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '안전한 화면으로 이동' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(safeNavigationReporter).toHaveBeenCalledTimes(1);
    expect(safeNavigationOwnerRetry).not.toHaveBeenCalled();
    expect(safeNavigation).toHaveBeenCalledTimes(1);
  },
};

const throwingReporter = fn(() => {
  throw new Error('reporter unavailable');
});

export const ReporterThrowFallsBackWithoutEventId: Story = {
  render: () => <ReporterFallbackHarness onReport={throwingReporter} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText(/오류 추적 ID를 확인하지 못했지만/)).resolves.toBeVisible();
    expect(canvas.queryByRole('button', { name: '오류 추적 ID 복사' })).not.toBeInTheDocument();
    expect(throwingReporter).toHaveBeenCalledTimes(1);
  },
};

const noIdReporter = fn(() => undefined);

export const ReporterWithoutEventIdFallsBackSafely: Story = {
  render: () => <ReporterFallbackHarness onReport={noIdReporter} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText(/오류 추적 ID를 확인하지 못했지만/)).resolves.toBeVisible();
    expect(canvas.queryByRole('button', { name: '오류 추적 ID 복사' })).not.toBeInTheDocument();
    expect(noIdReporter).toHaveBeenCalledTimes(1);
  },
};

const retryReFailureReports = fn();

export const RetryReFailureUsesNewIdAndClearsOldToast: Story = {
  render: () => <RetryReFailureHarness onReport={retryReFailureReports} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('event-1')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '오류 추적 ID 복사' }));
    await expect(canvas.findByText('오류 추적 ID를 복사했어요.')).resolves.toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('event-2')).resolves.toBeVisible();
    expect(canvas.queryByText('오류 추적 ID를 복사했어요.')).not.toBeInTheDocument();
    expect(retryReFailureReports).toHaveBeenCalledTimes(2);
    expect(retryReFailureReports).toHaveBeenNthCalledWith(1, 'event-1');
    expect(retryReFailureReports).toHaveBeenNthCalledWith(2, 'event-2');
  },
};

export const SessionFailOpenAndResetKey: Story = {
  render: () => <SessionBoundaryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('세션 오류 상태')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '세션 갱신' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
  },
};

const productionNavigation = fn();

export const ProductionAppProvidersSafeNavigation: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <ProductionAppProvidersHarness onNavigate={productionNavigation} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('문제가 발생했어요')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '안전한 화면으로 이동' }));

    await expect(canvas.findByText('/')).resolves.toBeVisible();
    expect(canvas.queryByText('문제가 발생했어요')).not.toBeInTheDocument();
    expect(productionNavigation).toHaveBeenCalledTimes(1);
    expect(productionNavigation).toHaveBeenCalledWith('replace', '/');
  },
};

export const DeferredClipboardAfterRetry: Story = {
  render: () => <DeferredClipboardHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '오류 추적 ID 복사' }));
    expect(canvas.queryByText('오류 추적 ID를 복사했어요.')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByText('복구됐습니다.')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '지연 복사 완료' }));

    expect(canvas.queryByText('오류 추적 ID를 복사했어요.')).not.toBeInTheDocument();
  },
};

export const DeferredClipboardAfterSafeNavigation: Story = {
  render: () => <DeferredClipboardHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '오류 추적 ID 복사' }));
    expect(canvas.queryByText('오류 추적 ID를 복사했어요.')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '안전한 화면으로 이동' }));
    await expect(canvas.findByText('복구됐습니다.')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '지연 복사 완료' }));

    expect(canvas.queryByText('오류 추적 ID를 복사했어요.')).not.toBeInTheDocument();
  },
};

const copySuccess = fn(async (value: string) => value === 'event-123');
const copyFailure = fn(async () => false);

export const UnexpectedErrorWithEventIdAndCopy: Story = {
  render: () => (
    <UnexpectedErrorScreen
      eventId="event-123"
      onRetry={() => undefined}
      onSafeNavigate={() => undefined}
      writeClipboard={copySuccess}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('event-123')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '오류 추적 ID 복사' }));

    expect(copySuccess).toHaveBeenCalledWith('event-123');
    await expect(canvas.findByText('오류 추적 ID를 복사했어요.')).resolves.toBeVisible();
  },
};

export const UnexpectedErrorWithoutEventIdFallback: Story = {
  render: () => (
    <UnexpectedErrorScreen onRetry={() => undefined} onSafeNavigate={() => undefined} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('button', { name: '오류 추적 ID 복사' })).not.toBeInTheDocument();
    expect(canvas.getByText(/오류 추적 ID를 확인하지 못했지만/)).toBeVisible();
  },
};

export const UnexpectedErrorCopyFailure: Story = {
  render: () => (
    <UnexpectedErrorScreen
      eventId="event-123"
      onRetry={() => undefined}
      onSafeNavigate={() => undefined}
      writeClipboard={copyFailure}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '오류 추적 ID 복사' }));

    await expect(canvas.findByText('오류 추적 ID를 복사하지 못했어요.')).resolves.toBeVisible();
  },
};

const longEventId = `sentry-event-${'0123456789abcdef'.repeat(10)}`;
const longEventCopy = fn(async (value: string) => value === longEventId);
const longEventRetry = fn();
const longEventSafeNavigate = fn();

export const LongEventIdMobileKeyboardActions: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => (
    <UnexpectedErrorScreen
      eventId={longEventId}
      onRetry={longEventRetry}
      onSafeNavigate={longEventSafeNavigate}
      writeClipboard={longEventCopy}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const eventId = canvas.getByText(longEventId);
    const copyButton = canvas.getByRole('button', { name: '오류 추적 ID 복사' });
    const retryButton = canvas.getByRole('button', { name: '다시 시도' });
    const safeNavigateButton = canvas.getByRole('button', { name: '안전한 화면으로 이동' });

    expect(eventId).toBeVisible();
    expect(eventId.getBoundingClientRect().height).toBeGreaterThan(24);
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);

    await userEvent.tab();
    expect(copyButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.findByText('오류 추적 ID를 복사했어요.')).resolves.toBeVisible();
    expect(longEventCopy).toHaveBeenCalledWith(longEventId);

    copyButton.focus();
    await userEvent.tab();
    expect(retryButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(longEventRetry).toHaveBeenCalledTimes(1);

    await userEvent.tab();
    expect(safeNavigateButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(longEventSafeNavigate).toHaveBeenCalledTimes(1);
  },
};
