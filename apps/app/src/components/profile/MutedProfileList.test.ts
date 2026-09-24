import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { MutedProfileList as MutedProfileListExport } from './MutedProfileList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('View', props, children),
});
mockModule(new URL('../pagination/PaginationSurface.tsx', import.meta.url), {
  PaginationSurface: (props: object) => createElement('PaginationSurface', props),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('Button', props, children),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  StateView: (props: object) => createElement('StateView', props),
});
mockModule(new URL('../ui/ToastProvider.tsx', import.meta.url), {
  useToast: () => ({ showToast: () => () => undefined }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({ foregroundPrimary: 'foreground' }),
});
mockModule(new URL('./ProfileListItemContent.tsx', import.meta.url), {
  ProfileListItemContent: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('ProfileRow', props, children),
});
const labelStyle = { fontSize: 16 };
mockModule('../../theme/tokens', { space: { 16: 16 }, textStyles: { uiLabelL: labelStyle } });

let MutedProfileList: typeof MutedProfileListExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ MutedProfileList } = await import('./MutedProfileList'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

describe('MutedProfileList', () => {
  it('loaded row renders the Figma name-only identity with the existing action', async () => {
    await act(async () => {
      renderer = create(
        createElement(MutedProfileList, {
          state: {
            pagination: { status: 'end' },
            profiles: [
              {
                action: createElement('Button'),
                avatarUri: 'https://media.example/avatar.png',
                displayName: '별마루',
                id: 'profile-star',
              },
            ],
            status: 'loaded',
          },
        }),
      );
    });

    const row = renderer?.root.find((node) => (node.type as unknown) === 'ProfileRow');
    assert.equal(row?.props.displayName, '별마루');
    assert.equal(row?.props.relativeHandle, undefined);
    assert.equal(row?.props.avatarUri, 'https://media.example/avatar.png');
    assert.equal(row?.props.identity.props.children, '별마루');
    assert.equal(row?.props.identity.props.style[0], labelStyle);
  });
});
