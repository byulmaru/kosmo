import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { GraphQLErrorBoundary } from '@/components/GraphQLErrorBoundary';
import { RouteBoundary } from '@/components/RouteBoundary';
import { UnexpectedErrorScreen } from '@/components/UnexpectedErrorScreen';
import { StructuredClientError } from '@/observability/client-error';
import { SessionFailOpenBoundary } from '@/session/SessionProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';

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

function RouteBoundaryHarness({ onRetry }: { onRetry: () => void }) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary onRetry={() => undefined}>
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
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('문제가 발생했어요');
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(graphQLRetry).toHaveBeenCalledTimes(1);
  },
};

const routeRetry = fn();

export const RouteFallbackAndRetry: Story = {
  render: () => <RouteBoundaryHarness onRetry={routeRetry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('경로를 불러오지 못했어요');
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(routeRetry).toHaveBeenCalledTimes(1);
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
    await expect(canvas.findByText('오류 추적 ID를 복사했습니다.')).resolves.toBeVisible();
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

    await expect(canvas.findByText('오류 추적 ID를 복사하지 못했습니다.')).resolves.toBeVisible();
    await expect(canvas.findByText('오류 추적 ID를 복사하지 못했어요.')).resolves.toBeVisible();
  },
};
