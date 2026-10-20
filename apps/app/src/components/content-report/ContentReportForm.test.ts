import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ContentReportForm as ContentReportFormComponent } from './ContentReportForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type MutationConfig = {
  onCompleted: (
    response: { submitContentReport: { status: string | null } | null },
    errors?: ReadonlyArray<unknown> | null,
  ) => void;
  onError: (error: Error) => void;
  variables: Record<string, unknown>;
};

const generationRef = { current: 1 };
const mutationConfigs: MutationConfig[] = [];
const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
let deliveredCount = 0;
let ContentReportForm: typeof ContentReportFormComponent;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useMutation: () => [
    (config: MutationConfig) => {
      mutationConfigs.push(config);
    },
    false,
  ],
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/components/ui/Button', {
  Button: (props: Record<string, unknown>) =>
    createElement('Button', props, props.children as string),
});
mockModule('@/components/ui/RadioGroup', {
  RadioGroup: (props: Record<string, unknown>) =>
    createElement('RadioGroup', props, props.children as never),
  RadioOption: (props: Record<string, unknown>) => createElement('RadioOption', props),
});
mockModule('@/components/ui/TextField', {
  TextArea: (props: Record<string, unknown>) => createElement('TextArea', props),
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    danger: '#a00',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { formStack: {} },
  spacing: { xl: 16, xs: 4 },
  typography: { md: {}, sm: {}, xsm: {} },
});

before(async () => {
  ({ ContentReportForm } = await import('./ContentReportForm'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mutationConfigs.length = 0;
  analyticsCalls.length = 0;
  deliveredCount = 0;
  generationRef.current = 1;
});

async function renderForm() {
  await act(async () => {
    renderer = create(
      createElement(ContentReportForm, {
        onDelivered: () => deliveredCount++,
        target: { id: 'target-1', kind: 'POST', label: '게시물' } as never,
      }),
    );
  });
  const button = renderer?.root.findByType('Button' as ElementType);
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  return button;
}

describe('Content report analytics', () => {
  it('records only a delivered report', async () => {
    const button = await renderForm();
    await act(async () => button.props.onPress());
    await act(async () =>
      mutationConfigs[0]?.onCompleted({ submitContentReport: { status: 'DELIVERED' } }),
    );

    assert.deepEqual(analyticsCalls, [['content_report_submitted', {}]]);
    assert.equal(deliveredCount, 1);
  });

  it('does not record rejected or unknown report outcomes', async () => {
    for (const status of ['REJECTED', 'PENDING']) {
      const button = await renderForm();
      await act(async () => button.props.onPress());
      await act(async () => mutationConfigs[0]?.onCompleted({ submitContentReport: { status } }));
      assert.deepEqual(analyticsCalls, []);
      assert.equal(deliveredCount, 0);
      await act(async () => renderer?.unmount());
      renderer = null;
      mutationConfigs.length = 0;
    }
  });
});
