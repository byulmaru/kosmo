import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostContentMention as PostContentMentionExport } from './PostContentMention';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (styles: Array<Record<string, unknown>>) => Object.assign({}, ...styles),
  },
  Text: 'Text',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children, href }: { children: ReactNode; href: unknown }) =>
    createElement('NavigationLink', { href }, children),
});
mockModule('@/theme/tokens', {
  fontWeights: { semibold: '600' },
});

type Profile = {
  readonly displayName: string;
  readonly id: string;
  readonly relativeHandle: string;
};

const mentionFallback = '@알 수 없는 사용자';

let PostContentMention: typeof PostContentMentionExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostContentMention } = await import('./PostContentMention'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

test('renders the Profile relative handle as an accessible inline link, routes to that handle, and stops parent propagation', async () => {
  const profile: Profile = {
    displayName: 'First Profile',
    id: 'profile-first',
    relativeHandle: '@first-profile',
  };
  await render({ interactive: true, linkColor: '#00f', profile });

  const navigationLink = firstRendered('NavigationLink');
  assert.equal(navigationLink.props.href, '/@first-profile');

  const link = firstRenderedByProps({ accessibilityRole: 'link' });
  assert.equal(link.type, 'Text');
  assert.equal(link.children.join(''), '@first-profile');
  assert.equal(link.props.accessibilityLabel, '@first-profile, First Profile, 프로필 보기');
  assert.deepEqual(link.props.style, {
    textDecorationLine: 'underline',
    fontWeight: '600',
    color: '#00f',
  });

  let propagationStopped = false;
  link.props.onPress({ stopPropagation: () => (propagationStopped = true) });
  assert.equal(propagationStopped, true);
});

test('interactive=false renders the relative handle as plain text without navigation affordance', async () => {
  await render({
    interactive: false,
    linkColor: '#00f',
    profile: {
      displayName: 'Quiet Profile',
      id: 'profile-quiet',
      relativeHandle: '@quiet-profile',
    },
  });

  assert.equal(rendered('NavigationLink').length, 0);
  const text = firstRendered('Text');
  assert.equal(text.children.join(''), '@quiet-profile');
  assert.equal(text.props.accessibilityRole, undefined);
  assert.equal(text.props.onPress, undefined);
});

test('renders an unavailable Mention as non-link fallback text', async () => {
  await render({ interactive: true, linkColor: '#00f', profile: undefined });

  assert.equal(rendered('NavigationLink').length, 0);
  const text = firstRendered('Text');
  assert.equal(text.children.join(''), mentionFallback);
  assert.equal(text.props.accessibilityRole, undefined);
  assert.equal(text.props.onPress, undefined);
});

async function render({
  interactive,
  linkColor,
  profile,
}: {
  interactive: boolean;
  linkColor: string;
  profile: Profile | undefined;
}) {
  await act(async () => {
    renderer = create(
      createElement(PostContentMention, {
        interactive,
        linkColor,
        profile: profile as never,
      }),
    );
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => (node.type as unknown) === type);
}

function firstRendered(type: string): ReactTestInstance {
  const [node] = rendered(type);
  assert.ok(node);
  return node;
}

function firstRenderedByProps(props: Record<string, unknown>): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps(props);
}
