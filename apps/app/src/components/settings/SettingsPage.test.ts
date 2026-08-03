import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type {
  SettingsPage as SettingsPageExport,
  SettingsProfileState,
  SettingsRouteState,
} from './SettingsPage';

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
    border: '#dddddd',
    card: '#ffffff',
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
  it('Byulmaru ID 외부 Account와 Kosmo 내부 Profile 소유 경계를 표시한다', async () => {
    await render({
      content: createElement('ProfileSettings'),
      displayName: '우주 기록자',
      relativeHandle: '@space-writer',
      status: 'selected',
    });

    assert.deepEqual(headingTexts(), ['계정 설정', '프로필 설정']);
    assert.ok(texts().includes('Byulmaru ID 외부 서비스'));
    assert.ok(texts().includes('Kosmo 내부 기능'));
    assert.equal(rendered('AccountEntry').length, 1);
    assert.equal(rendered('ProfileSettings').length, 1);

    const identity = renderer!.root.findByProps({
      accessibilityLabel: '현재 프로필 설정 대상: 우주 기록자, @space-writer',
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

  it('route loading은 공통 heading 아래에서 Profile과 Account 상태를 확정하지 않는다', async () => {
    await render({ status: 'loading' }, { status: 'loading' });

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('AccountEntry').length, 0);
    assert.equal(rendered('ProfileSettings').length, 0);
    assertStateView({ loading: true, title: '설정 페이지를 불러오는 중입니다.' });
  });

  it('route 오류는 page heading을 유지하고 같은 route를 재시도한다', async () => {
    const onRetry = mock.fn();
    await render({ status: 'loading' }, { status: 'error', onRetry });

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    const stateView = assertStateView({
      actionLabel: '다시 시도',
      alert: true,
      onAction: onRetry,
      title: '설정 페이지를 불러오지 못했어요',
    });
    stateView.props.onAction();
    assert.equal(onRetry.mock.callCount(), 1);
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

  it('shell이 heading을 소유하면 route PageHeader를 렌더링하지 않는다', async () => {
    await render(
      {
        content: createElement('ProfileSettings'),
        displayName: '우주 기록자',
        relativeHandle: '@space-writer',
        status: 'selected',
      },
      false,
    );

    assert.equal(rendered('PageHeader').length, 0);
    assert.deepEqual(headingTexts(), ['계정 설정', '프로필 설정']);
  });
});

async function render(
  profileStateOrProps:
    | SettingsProfileState
    | {
        accountContent: ReturnType<typeof createElement>;
        profileState: SettingsProfileState;
      },
  routeOwnsHeaderOrState: boolean | SettingsRouteState = true,
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
        ...(typeof routeOwnsHeaderOrState === 'boolean'
          ? { routeOwnsHeader: routeOwnsHeaderOrState }
          : { routeState: routeOwnsHeaderOrState }),
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

function assertStateView(expected: Record<string, unknown>) {
  const stateView = rendered('StateView')[0];
  assert.ok(stateView);
  Object.entries(expected).forEach(([key, value]) => assert.equal(stateView.props[key], value));
  return stateView;
}
