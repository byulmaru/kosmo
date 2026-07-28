import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { GraphQLErrorBoundary } from '@/components/GraphQLErrorBoundary';
import { RouteBoundary } from '@/components/RouteBoundary';
import { SessionFailOpenBoundary } from '@/session/SessionProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ErrorInfo } from 'react';

const renderError = new Error('production boundary fixture');

function ThrowOnRender({ active }: { active: boolean }) {
  if (active) {
    throw renderError;
  }

  return <Text>콘텐츠가 복구됐습니다.</Text>;
}

function GraphQLBoundaryHarness({
  onError,
  onRetry,
}: {
  onError: (error: unknown, info: ErrorInfo) => void;
  onRetry: () => void;
}) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary
      onError={onError}
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
  onError,
  onRetry,
}: {
  onError: (error: unknown, info: ErrorInfo) => void;
  onRetry: () => void;
}) {
  const [failed, setFailed] = useState(true);

  return (
    <GraphQLErrorBoundary onError={onError} onRetry={() => undefined}>
      <RouteBoundary
        loading={<Text>route loading</Text>}
        onRetry={() => {
          setFailed(false);
          onRetry();
        }}
        title="경로를 불러오지 못했어요"
      >
        <ThrowOnRender active={failed} />
      </RouteBoundary>
    </GraphQLErrorBoundary>
  );
}

function SessionBoundaryHarness({
  onError,
}: {
  onError: (error: unknown, info: ErrorInfo) => void;
}) {
  const [failed, setFailed] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  return (
    <GraphQLErrorBoundary onError={onError} onRetry={() => undefined}>
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

const graphQLErrorReporter = fn();
const graphQLRetry = fn();

export const GraphQLFallbackAndRetry: Story = {
  render: () => <GraphQLBoundaryHarness onError={graphQLErrorReporter} onRetry={graphQLRetry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('화면을 불러오지 못했어요');
    expect(graphQLErrorReporter).toHaveBeenCalled();
    const [error, info] = graphQLErrorReporter.mock.calls.at(-1) ?? [];
    expect(error).toBe(renderError);
    expect(info?.componentStack).toContain('ThrowOnRender');

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(graphQLRetry).toHaveBeenCalledTimes(1);
  },
};

const routeErrorReporter = fn();
const routeRetry = fn();

export const RouteFallbackAndRetry: Story = {
  render: () => <RouteBoundaryHarness onError={routeErrorReporter} onRetry={routeRetry} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('경로를 불러오지 못했어요');
    expect(routeErrorReporter).toHaveBeenCalled();
    const [error, info] = routeErrorReporter.mock.calls.at(-1) ?? [];
    expect(error).toBe(renderError);
    expect(info?.componentStack).toContain('ThrowOnRender');

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
    expect(routeRetry).toHaveBeenCalledTimes(1);
  },
};

const sessionErrorReporter = fn();

export const SessionFailOpenAndResetKey: Story = {
  render: () => <SessionBoundaryHarness onError={sessionErrorReporter} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('세션 오류 상태')).resolves.toBeVisible();
    expect(sessionErrorReporter).toHaveBeenCalled();
    const [error, info] = sessionErrorReporter.mock.calls.at(-1) ?? [];
    expect(error).toBe(renderError);
    expect(info?.componentStack).toContain('ThrowOnRender');

    await userEvent.click(canvas.getByRole('button', { name: '세션 갱신' }));

    await expect(canvas.findByText('콘텐츠가 복구됐습니다.')).resolves.toBeVisible();
  },
};
