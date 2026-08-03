import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { SettingsPage as SettingsPageExport, SettingsProfileState } from './SettingsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
const openProfileSwitcher = mock.fn();
mockModule(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => ({ openProfileSwitcher }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({
    background: '#ffffff',
    border: '#dddddd',
    card: '#ffffff',
    divider: '#eeeeee',
    surface: '#eeeeee',
    text: '#111111',
    textSecondary: '#666666',
  }),
});

let SettingsPage: typeof SettingsPageExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsPage } = await import('./SettingsPage'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsPage', () => {
  it('단일 heading과 행 접근성 이름으로 Account/Profile 소유 경계를 제공한다', async () => {
    await render({
      content: createElement('ProfileSettings'),
      displayName: '우주 기록자',
      relativeHandle: '@space-writer',
      status: 'selected',
    });

    assert.deepEqual(headingTexts(), []);
    assert.deepEqual(headingLevels(), []);
    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(texts().includes('계정 설정'), false);
    assert.equal(texts().includes('Byulmaru ID 외부 서비스'), false);
    assert.equal(texts().includes('프로필 설정'), false);
    assert.equal(texts().includes('Kosmo 내부 기능'), false);
    assert.equal(rendered('AccountEntry').length, 1);
    assert.equal(rendered('ProfileSettings').length, 1);

    const identity = renderer!.root.findByProps({
      accessibilityLabel: 'Kosmo 내부 프로필 설정 대상: 우주 기록자, @space-writer',
    });
    assert.equal(identity.props.accessible, true);
  });

  it('Profile이 없을 때 Account entry를 유지하고 Profile 선택 flow를 제공한다', async () => {
    await render({ actionLabel: '프로필 선택', status: 'empty' });

    assert.equal(rendered('AccountEntry').length, 1);
    const stateView = assertStateView({
      actionLabel: '프로필 선택',
      title: '설정할 프로필이 없어요',
    });
    stateView.props.onAction();
    assert.equal(openProfileSwitcher.mock.callCount(), 1);
  });

  it('Profile loading에서 Account data 상태를 만들거나 이전 Profile identity를 표시하지 않는다', async () => {
    await render({ status: 'loading' });

    assert.equal(rendered('AccountEntry').length, 1);
    assert.equal(texts().includes('우주 기록자'), false);
    assertStateView({ loading: true, title: '프로필 설정을 불러오는 중입니다.' });
  });

  it('Profile 오류를 section 안에서 재시도하고 Account entry를 유지한다', async () => {
    const onRetry = mock.fn();
    await render({ onRetry, status: 'error' });

    assert.equal(rendered('AccountEntry').length, 1);
    assertStateView({
      actionLabel: '다시 시도',
      alert: true,
      onAction: onRetry,
      title: '프로필 설정을 불러오지 못했어요',
    });
  });

  it('Account 외부 이동 오류 slot은 정상 Profile section과 독립적으로 유지된다', async () => {
    const onAccountRetry = mock.fn();
    await render({
      accountContent: createElement('AccountNavigationError', { onRetry: onAccountRetry }),
      profileState: {
        content: createElement('ProfileSettings'),
        displayName: '우주 기록자',
        relativeHandle: '@space-writer',
        status: 'selected',
      },
    });

    assert.equal(rendered('AccountNavigationError').length, 1);
    assert.equal(rendered('ProfileSettings').length, 1);
    rendered('AccountNavigationError')[0].props.onRetry();
    assert.equal(onAccountRetry.mock.callCount(), 1);
  });
});

async function render(
  profileStateOrProps:
    | SettingsProfileState
    | {
        accountContent: ReturnType<typeof createElement>;
        profileState: SettingsProfileState;
      },
) {
  const props =
    'profileState' in profileStateOrProps
      ? profileStateOrProps
      : {
          accountContent: createElement('AccountEntry'),
          profileState: profileStateOrProps,
        };
  await act(async () => {
    renderer = create(
      createElement(SettingsPage, {
        ...props,
      }),
    );
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}

function headingTexts(): string[] {
  return rendered('Text').flatMap((node) =>
    node.props.accessibilityRole === 'header' && typeof node.props.children === 'string'
      ? [node.props.children]
      : [],
  );
}

function headingLevels(): number[] {
  return rendered('Text')
    .filter((node) => node.props.accessibilityRole === 'header')
    .map((node) => node.props['aria-level']);
}

function assertStateView(expected: Record<string, unknown>) {
  const stateView = rendered('StateView')[0];
  assert.ok(stateView);
  Object.entries(expected).forEach(([key, value]) => assert.equal(stateView.props[key], value));
  return stateView;
}
