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
  Pressable: 'Pressable',
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
mockModule(new URL('../ui/Avatar.tsx', import.meta.url), {
  Avatar: (props: object) => createElement('Avatar', props),
});
mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({ children }: { children?: ReactNode }) => children,
});

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
  it('same-name rows render distinct handles through the shared profile row', async () => {
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
                relativeHandle: '@star',
              },
              {
                action: createElement('Button'),
                displayName: '별마루',
                id: 'profile-other',
                relativeHandle: '@other@example.org',
              },
            ],
            status: 'loaded',
          },
        }),
      );
    });

    const labels = renderer?.root
      .findAll((node) => (node.type as unknown) === 'Text')
      .map((node) => node.props.children);
    assert.deepEqual(labels, ['별마루', '@star', '별마루', '@other@example.org']);
    assert.equal(renderer?.root.findAll((node) => (node.type as unknown) === 'Button').length, 2);
    assert.equal(
      renderer?.root.findAll((node) => (node.type as unknown) === 'Avatar')[0]?.props.imageUri,
      'https://media.example/avatar.png',
    );
  });
});
