import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, Suspense } from 'react';
import * as ReactRelay from 'react-relay';
import { act, create } from 'react-test-renderer';
import { Environment, Network, Observable, RecordSource, Store } from 'relay-runtime';
import type { ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { GraphQLResponse } from 'relay-runtime';
import type { SettingsNaturalLanguageMute as SettingsNaturalLanguageMuteExport } from './SettingsNaturalLanguageMute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Request = {
  name: string;
  variables: Record<string, unknown>;
  sink: { next(response: GraphQLResponse): void; error(error: Error): void; complete(): void };
};

const require = createRequire(import.meta.url);
const profileId = 'profile:member';
const ruleId = 'natural-language-mute-rule:one';
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
mockModule('react-native', {
  Platform: { OS: 'web' },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: ({ children, loading }: { children: ReactNode; loading: ReactNode }) =>
    createElement(Suspense, { fallback: loading }, children),
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/shell/ShellChromeContext', {
  useShellChrome: () => ({ openProfileSwitcher: () => undefined }),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Button', props, children),
});
mockModule('@/components/ui/StateView', {
  StateView: (props: Record<string, unknown>) => createElement('StateView', props),
});
mockModule('@/components/ui/TextField', {
  TextArea: (props: Record<string, unknown>) => createElement('TextArea', props),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    feedbackDangerBase: 'danger',
    feedbackDangerOnSubtle: 'danger-subtle',
    foregroundSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  layoutRecipes: { formStack: {} },
  spacing: { lg: 16, sm: 8 },
  textStyles: { uiCopyM: {} },
});

before(async () => {
  ({ SettingsNaturalLanguageMute } = await import('./SettingsNaturalLanguageMute'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  requests = [];
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

function one(type: string) {
  const matches = all(type);
  assert.equal(matches.length, 1, `Expected one ${type}`);
  return matches[0]!;
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

function profile(id: string, role: 'MEMBER' | 'OWNER' | null, rules: unknown[] = []) {
  return {
    __typename: 'Profile',
    id,
    instance: { kind: 'LOCAL' },
    naturalLanguageMuteRules: rules,
    viewerState: {
      membership: role ? { id: `membership:${id}`, role } : null,
    },
  };
}

function sessionData(selectedProfile: ReturnType<typeof profile> | null) {
  return {
    currentSession: {
      id: 'session:member',
      selectedProfile,
    },
  };
}

async function respond(request: Request, data: Record<string, unknown>) {
  await act(async () => {
    request.sink.next({ data });
    request.sink.complete();
  });
}

function profileResult(rules: Array<{ condition: string; id: string }>) {
  return profile(
    profileId,
    'MEMBER',
    rules.map((rule) => ({ __typename: 'NaturalLanguageMuteRule', ...rule })),
  );
}

describe('SettingsNaturalLanguageMute with Relay', () => {
  it('allows 250 code points and blocks saving 251 while keeping delete available', async () => {
    await render(createEnvironment());
    await respond(
      latestRequest('SettingsNaturalLanguageMuteQuery'),
      sessionData(profile(profileId, 'MEMBER')),
    );

    const acceptedCondition = '😀'.repeat(250);
    await act(async () => one('TextArea').props.onChangeText(` ${acceptedCondition} `));
    assert.equal(one('Text').props.accessibilityLabel, '남은 글자 수 0자');
    assert.equal(button('저장').props.disabled, false);
    await act(async () => button('저장').props.onPress());

    const create = latestRequest('SettingsNaturalLanguageMuteCreateMutation');
    assert.deepEqual(create.variables, { input: { condition: acceptedCondition } });
    await respond(create, {
      createNaturalLanguageMuteRule: {
        profile: profileResult([{ condition: acceptedCondition, id: ruleId }]),
      },
    });

    const overLimitCondition = '😀'.repeat(251);
    await act(async () => one('TextArea').props.onChangeText(overLimitCondition));
    assert.equal(one('TextArea').props.value, overLimitCondition);
    assert.equal(one('Text').props.accessibilityLabel, '남은 글자 수 -1자');
    assert.equal(button('저장').props.disabled, true);
    assert.equal(button('삭제').props.disabled, false);
    await act(async () => button('저장').props.onPress());
    assert.equal(
      requests.some(({ name }) => name === 'SettingsNaturalLanguageMuteUpdateMutation'),
      false,
    );

    await act(async () => button('삭제').props.onPress());
    const remove = latestRequest('SettingsNaturalLanguageMuteDeleteMutation');
    await respond(remove, {
      deleteNaturalLanguageMuteRule: {
        naturalLanguageMuteRuleId: ruleId,
        profile: profileResult([]),
      },
    });
    assert.equal(one('TextArea').props.value, '');
  });

  it('Member can create, update, and delete the selected Profile rule through normalized responses', async () => {
    const environment = createEnvironment();
    await render(environment);
    await respond(
      latestRequest('SettingsNaturalLanguageMuteQuery'),
      sessionData(profile(profileId, 'MEMBER')),
    );

    const field = one('TextArea');
    assert.equal(field.props.value, '');
    assert.equal(button('저장').props.disabled, true);
    await act(async () => field.props.onChangeText('   '));
    assert.equal(field.props.error, '제외 조건을 입력해 주세요.');
    assert.equal(button('저장').props.disabled, true);
    assert.equal(
      requests.some(({ name }) => name === 'SettingsNaturalLanguageMuteCreateMutation'),
      false,
    );

    await act(async () => field.props.onChangeText('  avoid spoilers  '));
    assert.equal(button('저장').props.disabled, false);
    await act(async () => button('저장').props.onPress());
    const create = latestRequest('SettingsNaturalLanguageMuteCreateMutation');
    assert.deepEqual(create.variables, { input: { condition: 'avoid spoilers' } });
    await respond(create, {
      createNaturalLanguageMuteRule: {
        profile: profileResult([{ condition: 'avoid spoilers', id: ruleId }]),
      },
    });

    assert.equal(one('TextArea').props.value, 'avoid spoilers');
    assert.ok(all('Button').some((node) => node.children.includes('삭제')));
    assert.equal(button('저장').props.disabled, true);

    await act(async () => one('TextArea').props.onChangeText(' updated condition '));
    await act(async () => button('저장').props.onPress());
    const update = latestRequest('SettingsNaturalLanguageMuteUpdateMutation');
    assert.deepEqual(update.variables, {
      input: { naturalLanguageMuteRuleId: ruleId, condition: 'updated condition' },
    });
    await respond(update, {
      updateNaturalLanguageMuteRule: {
        profile: profileResult([{ condition: 'updated condition', id: ruleId }]),
      },
    });
    assert.equal(one('TextArea').props.value, 'updated condition');

    await act(async () => button('삭제').props.onPress());
    const remove = latestRequest('SettingsNaturalLanguageMuteDeleteMutation');
    assert.deepEqual(remove.variables, { input: { naturalLanguageMuteRuleId: ruleId } });
    await respond(remove, {
      deleteNaturalLanguageMuteRule: {
        naturalLanguageMuteRuleId: ruleId,
        profile: profileResult([]),
      },
    });
    assert.equal(one('TextArea').props.value, '');
    assert.equal(
      all('Button').some((node) => node.children.includes('삭제')),
      false,
    );
  });

  it('Owner can manage the same selected Profile rule', async () => {
    await render(createEnvironment());
    await respond(
      latestRequest('SettingsNaturalLanguageMuteQuery'),
      sessionData(profile(profileId, 'OWNER')),
    );

    assert.equal(all('TextArea').length, 1);
    assert.equal(all('StateView').length, 0);
  });

  it('No selected Profile shows the existing Profile selection state', async () => {
    await render(createEnvironment());
    await respond(latestRequest('SettingsNaturalLanguageMuteQuery'), sessionData(null));

    assert.equal(all('TextArea').length, 0);
    assert.equal(
      all('Button').some((node) => node.children.includes('저장')),
      false,
    );
    assert.equal(all('StateView')[0]?.props.title, '설정할 Profile이 없어요');
    assert.equal(all('StateView')[0]?.props.actionLabel, 'Profile 선택하기');
  });

  it('save failure keeps the draft and shows a safe retry message', async () => {
    await render(createEnvironment());
    await respond(
      latestRequest('SettingsNaturalLanguageMuteQuery'),
      sessionData(profile(profileId, 'MEMBER')),
    );
    await act(async () => one('TextArea').props.onChangeText('keep this draft'));
    await act(async () => button('저장').props.onPress());
    await act(async () =>
      latestRequest('SettingsNaturalLanguageMuteCreateMutation').sink.error(
        new Error('network failure'),
      ),
    );

    assert.equal(one('TextArea').props.value, 'keep this draft');
    assert.equal(
      all('Text').some((node) =>
        node.children.includes('제외 조건을 저장하지 못했어요. 다시 시도해 주세요.'),
      ),
      true,
    );
    assert.equal(button('저장').props.disabled, false);
  });
});
