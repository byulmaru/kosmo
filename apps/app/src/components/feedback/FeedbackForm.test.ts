import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FeedbackForm as FeedbackFormComponent } from './FeedbackForm';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let captureOutcome: 'resolve' | 'reject' = 'resolve';
let captureFeedbackCalls = 0;
const generationRef = { current: 1 };
const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
let FeedbackForm: typeof FeedbackFormComponent;
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
mockModule('expo-image-picker', {
  launchImageLibraryAsync: async () => ({ canceled: true, assets: [] }),
});
mockModule('lucide-react-native', {
  ImagePlusIcon: (props: Record<string, unknown>) => createElement('ImagePlusIcon', props),
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/components/media/imageUpload', {
  releaseImagePreview: () => {},
});
mockModule('@/components/post/PostComposer', {
  ComposerTool: (props: Record<string, unknown>) =>
    createElement('ComposerTool', props, props.children as never),
});
mockModule('@/components/post/PostComposerMediaItemsTarget', {
  PostComposerMediaItemsTarget: (props: Record<string, unknown>) =>
    createElement('PostComposerMediaItemsTarget', props),
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
mockModule('@/observability/sentry', {
  captureFeedback: async () => {
    captureFeedbackCalls += 1;
    if (captureOutcome === 'reject') {
      throw new Error('capture failed');
    }
  },
});
mockModule('@/relay/RelayEnvironmentBoundary', {
  useRelayEnvironmentGeneration: () => generationRef,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    card: '#fff',
    border: '#ddd',
    danger: '#a00',
    foregroundPrimary: '#111',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  layoutRecipes: { formStack: {} },
  radii: { md: 8 },
  spacing: { sm: 8, xl: 16, xs: 4 },
  typography: { md: {}, sm: {} },
});

before(async () => {
  ({ FeedbackForm } = await import('./FeedbackForm'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  captureOutcome = 'resolve';
  captureFeedbackCalls = 0;
  analyticsCalls.length = 0;
  generationRef.current = 1;
});

async function renderForm() {
  await act(async () => {
    renderer = create(createElement(FeedbackForm));
  });
  const textArea = renderer?.root.findByType('TextArea' as ElementType);
  assert.ok(textArea);
  await act(async () => textArea.props.onChangeText('테스트 피드백'));
  const button = renderer?.root.findByType('Button' as ElementType);
  assert.ok(button);
  assert.equal(button.props.disabled, false);
  return button;
}

async function settleSubmission() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Feedback analytics', () => {
  it('records a resolved feedback submission', async () => {
    const button = await renderForm();
    await act(async () => button.props.onPress());
    await settleSubmission();

    assert.equal(captureFeedbackCalls, 1);
    assert.deepEqual(analyticsCalls, [['feedback_submitted', {}]]);
    assert.equal(
      renderer?.root
        .findAllByType('Text' as ElementType)
        .some((node) => node.children.join('') === '피드백을 전달했습니다. 감사합니다!'),
      true,
    );
  });

  it('does not record a rejected feedback submission', async () => {
    captureOutcome = 'reject';
    const button = await renderForm();
    await act(async () => button.props.onPress());
    await settleSubmission();

    assert.equal(captureFeedbackCalls, 1);
    assert.deepEqual(analyticsCalls, []);
    assert.equal(
      renderer?.root
        .findAllByType('Text' as ElementType)
        .some(
          (node) =>
            node.children.join('') ===
            '피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.',
        ),
      true,
    );
  });
});
