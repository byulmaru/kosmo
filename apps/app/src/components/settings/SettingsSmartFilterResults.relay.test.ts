import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse, Variables } from 'relay-runtime';
import type { SettingsNaturalLanguageMute as SettingsNaturalLanguageMuteExport } from './SettingsNaturalLanguageMute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  name: string;
  variables: Variables;
  sink: { next(response: GraphQLResponse): void; error(error: Error): void; complete(): void };
};

const require = createRequire(import.meta.url);
const profileId = 'profile:member';
let focused = true;
let requests: Request[] = [];
let renderer: ReactTestRenderer | null = null;
let SettingsNaturalLanguageMute: typeof SettingsNaturalLanguageMuteExport;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', {
  ...ReactRelay,
  graphql: (parts: TemplateStringsArray) => {
    const name = parts.join('').match(/(?:query|fragment|mutation) (\w+)/)?.[1];
    assert.ok(name);
    return require(`./__generated__/${name}.graphql.ts`).default;
  },
});
mockModule('expo-router', { useIsFocused: () => focused });
mockModule('react-native', {
  Platform: { OS: 'ios' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => ({ width: 390 }),
});
mockModule('@/components/post/PostActionAuthentication', {
  PostActionAuthenticationProvider: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/post/PostComposerCoordinator', {
  PostComposerCoordinatorProvider: ({ children }: { children: ReactNode }) => children,
});
mockModule('@/components/post/PostMediaViewerHost', {
  PostMediaViewerHostProvider: ({ children }: { children: ReactNode }) => children,
});
mockModule(new URL('../post/PostListItem.tsx', import.meta.url), {
  PostListItem: ({ post }: { post: { id: string } }) =>
    createElement('PostListItem', { postId: post.id }),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ openProfileSwitcher: () => undefined }),
});
mockModule('@/components/shell/shellLayout', { getShellLayout: () => 'mobile' });
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: ({ actionLabel, onAction, ...props }: Record<string, unknown>) =>
    createElement(
      'StateView',
      props,
      typeof actionLabel === 'string' && typeof onAction === 'function'
        ? createElement('Button', { onPress: onAction }, actionLabel)
        : null,
    ),
});
mockModule('@/components/ui/TextField', {
  TextArea: (props: Record<string, unknown>) => createElement('TextArea', props),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundCanvas: 'canvas',
    feedbackDangerBase: 'danger',
    feedbackDangerOnSubtle: 'danger-subtle',
    foregroundSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  layoutRecipes: { formStack: {} },
  spacing: { lg: 16, md: 12, sm: 8 },
  textStyles: { uiCopyM: {}, uiCopyS: {}, uiLabelS: {} },
});

before(async () => {
  ({ SettingsNaturalLanguageMute } = await import('./SettingsNaturalLanguageMute'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests = [];
  focused = true;
});

function createEnvironment() {
  return new Environment({
    network: Network.create((operation, variables) =>
      Observable.create<GraphQLResponse>((sink) => {
        requests.push({ name: operation.name, variables, sink });
      }),
    ),
    store: new Store(new RecordSource()),
  });
}

async function render(environment: Environment) {
  await act(async () => {
    const tree = createElement(ReactRelay.RelayEnvironmentProvider, {
      children: createElement(SettingsNaturalLanguageMute),
      environment,
    });
    if (renderer) {
      renderer.update(tree);
    } else {
      renderer = create(tree);
    }
  });
}

function all(type: string, root: ReactTestInstance | undefined = renderer?.root) {
  assert.ok(root);
  return root.findAll((node) => node.type === type);
}

function button(label: string) {
  const result = all('Button').find((node) => node.children.includes(label));
  assert.ok(result, `Missing ${label} button`);
  return result;
}

function latestRequest(name: string) {
  const request = requests.findLast((request) => request.name === name);
  assert.ok(request, `Missing ${name} request`);
  return request;
}

function profile(id: string, role: 'MEMBER' | 'OWNER' = 'MEMBER') {
  return {
    __typename: 'Profile',
    avatar: null,
    displayName: 'Member',
    id,
    instance: { kind: 'LOCAL' },
    naturalLanguageMuteRules: [],
    private: { defaultPostVisibility: 'PUBLIC' },
    relativeHandle: '@member',
    viewerState: {
      membership: { id: `membership:${id}`, role },
    },
  };
}

function sessionData(selectedProfile: ReturnType<typeof profile> | null) {
  return { currentSession: { id: 'session:member', selectedProfile } };
}

function resultsData(
  rows: Array<{ id: string; probability: number | null }>,
  hasNextPage: boolean,
  endCursor: string,
) {
  return {
    ...sessionData(profile(profileId)),
    smartFilterResults: {
      edges: rows.map(({ id, probability }) => ({
        cursor: endCursor,
        node: {
          __typename: 'Post',
          id,
          smartFilterProbability: probability,
        },
      })),
      pageInfo: { endCursor, hasNextPage },
    },
  };
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

async function respondSmartFilterUnavailable(request: Request) {
  await act(async () => {
    request.sink.next({
      data: null,
      errors: [
        {
          message: 'Smart-filter results are unavailable',
          path: ['smartFilterResults'],
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        },
      ],
    } as unknown as GraphQLResponse);
    request.sink.complete();
  });
}

function textValues() {
  return all('Text').flatMap((node) => node.children.filter((child) => typeof child === 'string'));
}

function postIds() {
  return all('PostListItem').map((node) => node.props.postId);
}

async function loadSelectedProfile(environment: Environment, id = profileId) {
  await render(environment);
  await respond(latestRequest('SettingsNaturalLanguageMuteQuery'), sessionData(profile(id)));
}

async function revealResults() {
  await act(async () => button('판정 결과 보기').props.onPress());
  return latestRequest('SettingsSmartFilterResultsQuery');
}

describe('SettingsSmartFilterResults with Relay', () => {
  it('waits for the reveal action, classifies the raw threshold, and omits null probabilities', async () => {
    const environment = createEnvironment();
    await render(environment);
    assert.deepEqual(
      requests.map(({ name }) => name),
      ['SettingsNaturalLanguageMuteQuery'],
    );
    await respond(
      latestRequest('SettingsNaturalLanguageMuteQuery'),
      sessionData(profile(profileId)),
    );
    assert.equal(
      requests.some(({ name }) => name === 'SettingsSmartFilterResultsQuery'),
      false,
    );

    const results = await revealResults();
    await respond(
      results,
      resultsData(
        [
          { id: 'post:below-threshold', probability: 0.7999 },
          { id: 'post:at-threshold', probability: 0.8 },
          { id: 'post:no-probability', probability: null },
        ],
        false,
        'cursor:last',
      ),
    );

    assert.deepEqual(
      new Set(textValues().filter((text) => text === '제외' || text === '통과')),
      new Set(['통과', '제외']),
    );
    assert.ok(textValues().includes('79.9%'));
    assert.ok(textValues().includes('80%'));
    assert.deepEqual(postIds().sort(), ['post:at-threshold', 'post:below-threshold']);
  });

  it('renders every Post from a page larger than the requested count', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const results = await revealResults();
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: `post:oversized-${index}`,
      probability: 0.5,
    }));
    await respond(results, resultsData(rows, false, '0'));

    assert.deepEqual(postIds().sort(), rows.map(({ id }) => id).sort());
  });

  it('keeps More for an empty page and continues its cursor only after the user asks', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const results = await revealResults();
    await respond(results, resultsData([], true, 'cursor:empty-page'));

    assert.deepEqual(postIds(), []);
    assert.equal(button('더 보기').props.disabled, false);
    assert.equal(
      requests.filter(({ name }) => name === 'SettingsSmartFilterResultsNextPageQuery').length,
      0,
    );

    await act(async () => button('더 보기').props.onPress());
    const nextPage = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    assert.deepEqual(nextPage.variables, { count: 20, cursor: 'cursor:empty-page' });
    await respond(
      nextPage,
      resultsData([{ id: 'post:visible-next-page', probability: 0.51 }], false, 'cursor:visible'),
    );

    assert.deepEqual(postIds(), ['post:visible-next-page']);
    assert.ok(textValues().includes('통과'));
  });

  it('renders a Post only once when later pages repeat it', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const results = await revealResults();
    await respond(
      results,
      resultsData([{ id: 'post:repeated', probability: 0.9 }], true, 'cursor:first'),
    );

    await act(async () => button('더 보기').props.onPress());
    const nextPage = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    await respond(
      nextPage,
      resultsData(
        [
          { id: 'post:repeated', probability: 0.9 },
          { id: 'post:unique', probability: 0.1 },
        ],
        false,
        'cursor:second',
      ),
    );

    assert.deepEqual(postIds().sort(), ['post:repeated', 'post:unique']);
    assert.deepEqual(
      new Set(textValues().filter((text) => text === '제외' || text === '통과')),
      new Set(['제외', '통과']),
    );
  });

  it('preserves visible rows after a next-page error and retries the same cursor', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const results = await revealResults();
    await respond(
      results,
      resultsData([{ id: 'post:visible', probability: 0.9 }], true, 'cursor:visible'),
    );

    await act(async () => button('더 보기').props.onPress());
    const failedPage = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    await act(async () => failedPage.sink.error(new Error('network failure')));

    assert.deepEqual(postIds(), ['post:visible']);
    const retryState = all('StateView').find((node) =>
      String(node.props.title).includes('더 불러오지 못했어요'),
    );
    assert.ok(retryState);
    await act(async () => button('다시 시도').props.onPress());

    const retry = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    assert.notEqual(retry, failedPage);
    assert.deepEqual(retry.variables, { count: 20, cursor: 'cursor:visible' });
    await respond(
      retry,
      resultsData([{ id: 'post:next', probability: 0.1 }], false, 'cursor:next'),
    );

    assert.deepEqual(postIds().sort(), ['post:next', 'post:visible']);
    assert.equal(
      all('StateView').some((node) => String(node.props.title).includes('더 불러오지 못했어요')),
      false,
    );
  });

  it('shows an initial GraphQL error and retries the query through RouteBoundary', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const initialRequest = await revealResults();
    await respondSmartFilterUnavailable(initialRequest);

    assert.ok(all('StateView').some((node) => node.props.alert === true));
    const retryButton = button('다시 시도');
    await act(async () => retryButton.props.onPress());

    const retriedRequest = latestRequest('SettingsSmartFilterResultsQuery');
    assert.notEqual(retriedRequest, initialRequest);
    await respond(
      retriedRequest,
      resultsData([{ id: 'post:retried', probability: 0.4 }], false, 'cursor:retried'),
    );

    assert.deepEqual(postIds(), ['post:retried']);
  });

  it('preserves visible rows after a GraphQL page error and retries the same cursor', async () => {
    const environment = createEnvironment();
    await loadSelectedProfile(environment);
    const results = await revealResults();
    await respond(
      results,
      resultsData([{ id: 'post:visible', probability: 0.9 }], true, 'cursor:visible'),
    );

    await act(async () => button('더 보기').props.onPress());
    const failedPage = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    await respondSmartFilterUnavailable(failedPage);

    assert.deepEqual(postIds(), ['post:visible']);
    const retryState = all('StateView').find((node) => node.props.alert === true);
    assert.ok(retryState);
    await act(async () => button('다시 시도').props.onPress());

    const retry = latestRequest('SettingsSmartFilterResultsNextPageQuery');
    assert.notEqual(retry, failedPage);
    assert.equal(retry.variables.cursor, 'cursor:visible');
    await respond(
      retry,
      resultsData([{ id: 'post:next', probability: 0.1 }], false, 'cursor:next'),
    );

    assert.deepEqual(postIds().sort(), ['post:next', 'post:visible']);
    assert.equal(
      all('StateView').some((node) => node.props.alert === true),
      false,
    );
  });

  it('resets the reveal on route blur and component remount', async () => {
    const firstEnvironment = createEnvironment();
    await loadSelectedProfile(firstEnvironment);
    const results = await revealResults();
    await respond(
      results,
      resultsData([{ id: 'post:actor-a', probability: 0.9 }], false, 'cursor:a'),
    );
    assert.deepEqual(postIds(), ['post:actor-a']);

    focused = false;
    await render(firstEnvironment);
    assert.deepEqual(postIds(), []);
    focused = true;
    await render(firstEnvironment);
    assert.ok(button('판정 결과 보기'));
    assert.deepEqual(postIds(), []);

    const reopenedResults = await revealResults();
    assert.notEqual(reopenedResults, results);
    await respond(
      reopenedResults,
      resultsData([{ id: 'post:actor-a-refreshed', probability: 0.85 }], false, 'cursor:refresh'),
    );
    assert.deepEqual(postIds(), ['post:actor-a-refreshed']);

    const secondEnvironment = createEnvironment();
    await act(async () => {
      renderer?.unmount();
      renderer = null;
    });
    await loadSelectedProfile(secondEnvironment, 'profile:member-b');
    assert.deepEqual(postIds(), []);
    assert.ok(all('Button').some((node) => node.children.includes('판정 결과 보기')));
    assert.equal(
      requests.filter(({ name }) => name === 'SettingsSmartFilterResultsQuery').length,
      2,
    );
  });
});
