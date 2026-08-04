import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SettingsPageProps } from './SettingsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 1_024, height: 900 }),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => {
    assert.match(parts.join(''), /fragment SettingsPage_profile/);
    return 'SettingsPage_profile';
  },
  useFragment: (_fragment: string, profile: object | null) => profile,
});
mockModule(new URL('./ByulmaruIdAccountSettingsEntry', import.meta.url), {
  ByulmaruIdAccountSettingsEntry: () => createElement('AccountSettingsEntry'),
});
mockModule(new URL('../profile/ProfileDefaultPostVisibilityControl.tsx', import.meta.url), {
  ProfileDefaultPostVisibilityControl: (props: object) =>
    createElement('ProfileDefaultPostVisibilityControl', props),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: (props: object) => createElement('Button', props),
});
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule(new URL('../shell/ShellChromeContext.tsx', import.meta.url), {
  useShellChrome: () => ({ openProfileSwitcher: () => undefined }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ divider: '#eeeeee', text: '#111111', textSecondary: '#666666' }),
});

let SettingsPage: ComponentType<SettingsPageProps>;
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

async function renderPage(profile: unknown, accountEntry?: ReactNode) {
  await act(async () => {
    renderer = create(
      createElement(SettingsPage, {
        accountEntry,
        profile: profile as SettingsPageProps['profile'],
      }),
    );
  });
  assert.ok(renderer);
}

function rendered(type: string) {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function requireRendered(type: string) {
  const node = rendered(type)[0];
  assert.ok(node);
  return node;
}

describe('SettingsPage Profile child composition', () => {
  it('Account entry 다음에 Owner Profile control을 현재 identity와 함께 연결한다', async () => {
    await renderPage({
      id: 'profile-owner',
      viewerState: { isSelf: true },
    });

    assert.equal(rendered('AccountSettingsEntry').length, 1);
    assert.equal(requireRendered('ProfileDefaultPostVisibilityControl').props.editable, true);
    assert.equal(requireRendered('PageHeader').props.title, '설정');
  });

  it('Member Profile은 control을 연결하되 변경 권한을 전달하지 않는다', async () => {
    await renderPage({
      id: 'profile-member',
      viewerState: { isSelf: false },
    });

    assert.equal(requireRendered('ProfileDefaultPostVisibilityControl').props.editable, false);
  });

  it('selected Profile이 없어도 Account entry와 선택 empty state를 유지한다', async () => {
    await renderPage(null);

    assert.equal(rendered('AccountSettingsEntry').length, 1);
    assert.equal(rendered('ProfileDefaultPostVisibilityControl').length, 0);
    assert.equal(
      rendered('View').some((node) => node.props.testID === 'settings-profile-empty'),
      true,
    );
    assert.equal(requireRendered('Button').props.children, '프로필 선택');
  });

  it('Account child 오류가 있어도 Profile child 경계를 숨기지 않는다', async () => {
    const accountError = createElement('AccountSettingsError', { role: 'alert' });
    await renderPage({ id: 'profile-owner', viewerState: { isSelf: true } }, accountError);

    assert.equal(rendered('AccountSettingsError').length, 1);
    assert.equal(rendered('ProfileDefaultPostVisibilityControl').length, 1);
  });
});
