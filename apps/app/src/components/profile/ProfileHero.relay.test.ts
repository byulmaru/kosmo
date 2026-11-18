import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  Observable,
  RecordSource,
  Store,
} from 'relay-runtime';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { ProfileHeroRelayTestQuery } from './__generated__/ProfileHeroRelayTestQuery.graphql';
import type { ProfileHero as ProfileHeroExport } from './ProfileHero';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  name: string;
  sink: {
    next(response: GraphQLResponse): void;
    complete(): void;
  };
};

const requests: Request[] = [];
let ProfileHero: typeof ProfileHeroExport;
let profileHeroRelayTestQuery: ReactRelay.GraphQLTaggedNode;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

const relayGraphql = (parts: TemplateStringsArray) => {
  const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
  assert.ok(name);
  return require(`./__generated__/${name}.graphql.ts`).default;
};

const require = createRequire(import.meta.url);

mockModule('react-relay', { ...ReactRelay, graphql: relayGraphql });
mockModule('react-native', {
  Image: 'Image',
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  Pressable: 'Pressable',
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (styles: ReadonlyArray<Record<string, unknown>>) =>
      Object.assign({}, ...styles.flat()),
  },
  Text: 'Text',
  useWindowDimensions: () => ({ height: 800, width: 1_280 }),
  View: 'View',
});
mockModule('@/analytics/client', { trackAnalytics: () => undefined });
mockModule('@/components/post/postClipboard', { setStringAsync: async () => true });
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children }: { children?: ReactNode }) => children,
});
mockModule('@/components/ui/Avatar', {
  Avatar: ({ label }: { label: string }) => createElement('Avatar', { label }),
});
mockModule('@/components/ui/StateView', { Skeleton: 'Skeleton' });
mockModule('@/components/ui/ToastProvider', { useToast: () => ({ showToast: () => undefined }) });
mockModule('@/config/origin', { getPublicWebOrigin: () => 'https://kosmo.example' });
mockModule('@/session/SessionProvider', { useSession: () => ({ accountId: null }) });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    actionPrimaryBase: '#111111',
    backgroundCanvas: '#ffffff',
    foregroundPrimary: '#111111',
    foregroundSecondary: '#666666',
  }),
});
mockModule('@/theme/tokens', {
  breakpoints: { compact: 1_024 },
  radius: { 12: 12, full: 999 },
  radii: { md: 8 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiHeadingM: {}, uiLabelM: {} },
});
mockModule(new URL('./ProfileBioPrivacyBoundary.tsx', import.meta.url), {
  ProfileBioPrivacyBoundary: ({ children }: { children?: ReactNode }) => children,
});
mockModule(new URL('./ProfileBlockAction.tsx', import.meta.url), {
  ProfileBlockAction: () => null,
});
mockModule(new URL('./ProfileMoreMenu.tsx', import.meta.url), { ProfileMoreMenu: () => null });
mockModule(new URL('./ProfileMuteAction.tsx', import.meta.url), { ProfileMuteAction: () => null });
mockModule(new URL('./ProfileTagChip.tsx', import.meta.url), { ProfileTagChip: () => null });
mockModule('lucide-react-native', {
  Ban: 'Ban',
  Link2: 'Link2',
  VolumeOff: 'VolumeOff',
  XIcon: 'XIcon',
});

before(async () => {
  const { graphql } = await import('react-relay');
  profileHeroRelayTestQuery = graphql`
    query ProfileHeroRelayTestQuery {
      node(id: "profile-limited") {
        __typename
        ... on Profile {
          ...ProfileHero_profile @alias(as: "profile")
        }
      }
    }
  `;
  ({ ProfileHero } = await import('./ProfileHero'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  requests.length = 0;
  mock.restoreAll();
});

function createEnvironment() {
  return new Environment({
    network: Network.create((operation) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

function ProfileHeroQuerySurface() {
  const data = ReactRelay.useLazyLoadQuery<ProfileHeroRelayTestQuery>(
    profileHeroRelayTestQuery,
    {},
    { fetchPolicy: 'network-only' },
  );
  const node = data.node;
  if (node?.__typename !== 'Profile') {
    return null;
  }

  return node.profile ? createElement(ProfileHero, { profile: node.profile }) : null;
}

async function render(environment: Environment) {
  await act(async () => {
    renderer = create(
      createElement(
        Suspense,
        { fallback: createElement('Loading') },
        createElement(ReactRelay.RelayEnvironmentProvider, {
          children: createElement(ProfileHeroQuerySurface),
          environment,
        }),
      ),
    );
  });
}

function latestRequest(name: string) {
  const request = requests.findLast((candidate) => candidate.name === name);
  assert.ok(request, `Missing ${name} request`);
  return request;
}

async function respond(request: Request, profile: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data: { node: profile } });
    request.sink.complete();
  });
}

function renderedText() {
  assert.ok(renderer);
  return renderer.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => node.children.join(''));
}

it('updates the same normalized Profile when selected fields become null', async () => {
  const environment = createEnvironment();
  await render(environment);

  await respond(latestRequest('ProfileHeroRelayTestQuery'), {
    __typename: 'Profile',
    avatar: null,
    bio: 'Loaded biography',
    displayName: 'Loaded name',
    followersCount: 23,
    followingCount: 14,
    header: null,
    id: 'profile-limited',
    relativeHandle: '@limited',
    tags: [{ __typename: 'Hashtag', id: 'hashtag-loaded', name: 'Loaded tag' }],
    viewerState: null,
  });

  assert.ok(renderedText().includes('Loaded name'));
  assert.ok(renderedText().includes('Loaded biography'));
  assert.ok(renderedText().includes('23'));
  assert.ok(renderedText().includes('14'));
  assert.equal(renderer!.root.findAllByProps({ testID: 'profile-tag-list' }).length, 1);

  const operation = createOperationDescriptor(getRequest(profileHeroRelayTestQuery), {});
  environment.execute({ operation }).subscribe({ next: () => undefined });
  await respond(latestRequest('ProfileHeroRelayTestQuery'), {
    __typename: 'Profile',
    avatar: null,
    bio: null,
    displayName: null,
    followersCount: null,
    followingCount: null,
    header: null,
    id: 'profile-limited',
    relativeHandle: '@limited',
    tags: null,
    viewerState: null,
  });

  const text = renderedText();
  assert.ok(text.includes('@limited'));
  assert.ok(!text.includes('Loaded name'));
  assert.ok(!text.includes('Loaded biography'));
  assert.ok(!text.includes('Loaded tag'));
  assert.ok(!text.includes('23'));
  assert.ok(!text.includes('14'));
  assert.ok(!text.includes('팔로잉'));
  assert.ok(!text.includes('팔로워'));
  assert.equal(renderer!.root.findAllByProps({ testID: 'profile-tag-list' }).length, 0);
  assert.equal(
    renderer!.root.findAll(
      (node) => (node.type as unknown) === 'Avatar' && node.props.label === '@limited',
    ).length,
    1,
  );
});
