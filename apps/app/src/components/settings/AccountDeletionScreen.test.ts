import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { AccountDeletionScreenProps, AccountDeletionState } from './AccountDeletionScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/ConfirmationContent.tsx', import.meta.url), {
  exports: {
    ConfirmationContent: ({ children, ...props }: Record<string, unknown>) =>
      createElement('ConfirmationContent', props, children as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/Checkbox.tsx', import.meta.url), {
  exports: {
    Checkbox: (props: Record<string, unknown>) => createElement('Checkbox', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/StateView.tsx', import.meta.url), {
  exports: {
    StateView: (props: Record<string, unknown>) => createElement('StateView', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      actionPrimaryBase: '#ffe597',
      actionPrimaryOnBase: '#1a1a1a',
      backgroundSurface: '#ffffff',
      borderStrong: '#a5a5af',
      feedbackDangerBase: '#b42318',
      foregroundSecondary: '#64646f',
      stateDisabledForeground: '#a5a5af',
      stateDisabledSurface: '#f4f4f5',
      stateFocusRing: '#4f46e5',
      statePressed: '#00000014',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let AccountDeletionScreen: ComponentType<AccountDeletionScreenProps>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ AccountDeletionScreen } = await import('./AccountDeletionScreen'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('AccountDeletionScreen', () => {
  it('조회 중에는 탈퇴 가능 상태를 추측하지 않고 loading을 표시한다', async () => {
    await render({ phase: 'loading' });

    const stateView = rendered('StateView')[0];
    assert.equal(stateView.props.loading, true);
    assert.equal(stateView.props.title, '코스모 탈퇴 정보를 불러오는 중입니다.');
    assert.equal(rendered('ConfirmationContent').length, 0);
  });

  it('조회 오류에는 안전한 설명과 다시 시도 action을 표시한다', async () => {
    let retries = 0;
    await render(
      { phase: 'load-error' },
      {
        onRetry: () => {
          retries += 1;
        },
      },
    );

    const stateView = rendered('StateView')[0];
    assert.equal(stateView.props.alert, true);
    assert.equal(stateView.props.title, '코스모 탈퇴 정보를 불러오지 못했어요');
    assert.equal(stateView.props.description, '잠시 후 다시 시도해주세요.');
    assert.equal(stateView.props.actionLabel, '다시 시도');
    await act(async () => stateView.props.onAction());
    assert.equal(retries, 1);
  });

  it('활성 Profile 개수와 차단 이유만 표시하고 action은 노출하지 않는다', async () => {
    await render({ activeProfileCount: 2, phase: 'blocked' });

    const stateView = rendered('StateView')[0];
    assert.equal(stateView.props.title, '코스모 탈퇴를 할 수 없어요');
    assert.equal(
      stateView.props.description,
      '활성 Profile 2개가 남아 있어 코스모를 탈퇴할 수 없어요. 모든 Profile을 먼저 비활성화해주세요.',
    );
    assert.equal(stateView.props.actionLabel, undefined);
    assert.equal(rendered('ConfirmationContent').length, 0);
  });

  it('확인 전 action을 disabled로 두고 acknowledgement 변경을 caller에 전달한다', async () => {
    const changes: boolean[] = [];
    let confirms = 0;
    await render(
      { acknowledged: false, phase: 'idle' },
      {
        onAcknowledgementChange: (checked) => changes.push(checked),
        onConfirm: () => {
          confirms += 1;
        },
      },
    );

    const confirmation = rendered('ConfirmationContent')[0];
    assert.equal(confirmation.props.confirmLabel, '코스모 탈퇴');
    assert.equal(confirmation.props.confirmDisabled, true);
    const checkbox = rendered('Checkbox')[0];
    assert.equal(checkbox.props.accessibilityLabel, '탈퇴 후 처리 내용을 모두 확인했습니다.');
    assert.equal(checkbox.props.checked, false);
    assert.equal(checkbox.props.disabled, false);

    await act(async () => checkbox.props.onCheckedChange(true));
    assert.deepEqual(changes, [true]);
    await act(async () => confirmation.props.onConfirm());
    assert.equal(confirms, 1);
  });

  it('pending에서는 확인, 취소, checkbox를 잠그고 acknowledgement를 유지한다', async () => {
    await render({ phase: 'pending' });

    const confirmation = rendered('ConfirmationContent')[0];
    assert.equal(confirmation.props.pending, true);
    assert.equal(confirmation.props.confirmDisabled, undefined);
    const checkbox = rendered('Checkbox')[0];
    assert.equal(checkbox.props.checked, true);
    assert.equal(checkbox.props.disabled, true);
  });

  it('error에서는 확인 내용을 유지하고 다시 시도를 전달한다', async () => {
    let retries = 0;
    await render(
      { acknowledged: true, phase: 'error' },
      {
        onRetry: () => {
          retries += 1;
        },
      },
    );

    const confirmation = rendered('ConfirmationContent')[0];
    assert.equal(confirmation.props.confirmLabel, '다시 시도');
    assert.equal(confirmation.props.confirmDisabled, false);
    assert.equal(
      rendered('Text').some(
        (node) =>
          node.props.accessibilityRole === 'alert' &&
          node.props.children === '코스모 탈퇴를 완료하지 못했어요. 다시 시도해주세요.',
      ),
      true,
    );
    await act(async () => confirmation.props.onConfirm());
    assert.equal(retries, 1);
  });

  it('성공은 서버 확인 후 결과와 login 이동 안내만 표시한다', async () => {
    await render({ phase: 'success' });

    const stateView = rendered('StateView')[0];
    assert.equal(stateView.props.title, '코스모 탈퇴가 완료됐어요');
    assert.equal(stateView.props.description, '로그인 화면으로 이동합니다.');
    assert.equal(rendered('ConfirmationContent').length, 0);
  });
});

async function render(
  state: AccountDeletionState,
  props: Omit<AccountDeletionScreenProps, 'state'> = {},
) {
  await act(async () => {
    renderer = create(createElement(AccountDeletionScreen, { ...props, state }));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}
