import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

type QueryData = {
  me: {
    profiles: ReadonlyArray<{ id: string }>;
  } | null;
};

type MutationResponse = {
  deleteAccount: {
    completed: boolean;
  };
};

type MutationConfig = {
  onCompleted: (response: MutationResponse, errors?: ReadonlyArray<unknown> | null) => void;
  onError: (error: Error) => void;
  variables: Record<string, unknown>;
};

type ScreenProps = {
  onAcknowledgementChange: (checked: boolean) => void;
  onConfirm: () => void;
  onRetry: () => void;
  state: {
    acknowledged?: boolean;
    activeProfileCount?: number;
    phase: string;
  };
};

let queryData: QueryData = { me: { profiles: [] } };
let mutationCalls: MutationConfig[] = [];
let cleanupCalls = 0;
let screenProps: ScreenProps | null = null;
let renderer: ReactTestRenderer | null = null;

mock.module('expo-router', {
  exports: {
    useRouter: () => ({ replace: () => undefined }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-relay', {
  exports: {
    graphql: (parts: TemplateStringsArray) => parts.join(''),
    useLazyLoadQuery: () => queryData,
    useMutation: () => [
      (config: MutationConfig) => {
        mutationCalls.push(config);
      },
    ],
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../PageHeader.tsx', import.meta.url), {
  exports: { PageHeader: () => createElement('PageHeader') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./AccountDeletionScreen.tsx', import.meta.url), {
  exports: {
    AccountDeletionScreen: (props: ScreenProps) => {
      screenProps = props;
      return createElement('AccountDeletionScreen', props);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../RouteBoundary.tsx', import.meta.url), {
  exports: {
    RouteBoundary: ({ children }: { children: unknown }) => children,
    useRouteBoundary: () => ({ fetchKey: 0, refetch: () => undefined }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsRouteContext.tsx', import.meta.url), {
  exports: { useSettingsDetailHeaderMode: () => 'hidden' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/NavigationGuardContext.tsx', import.meta.url), {
  exports: {
    useNavigationGuard: () => ({ register: () => () => undefined, request: () => false }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/IconButton.tsx', import.meta.url), {
  exports: { IconButton: () => createElement('IconButton') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../ui/StateView.tsx', import.meta.url), {
  exports: { StateView: () => createElement('StateView') },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../session/logout.tsx', import.meta.url), {
  exports: {
    useAccountDeletionCleanup: () => ({
      error: null,
      logout: () => {
        cleanupCalls += 1;
      },
      pending: false,
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: { useTheme: () => ({ text: '#111111' }) },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronLeftIcon: 'ChevronLeftIcon' },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsAccountDeletionRoute: ComponentType;

before(async () => {
  ({ default: SettingsAccountDeletionRoute } =
    await import('../../app/(tabs)/(protected)/settings/account-deletion'));
});

afterEach(async () => {
  queryData = { me: { profiles: [] } };
  mutationCalls = [];
  cleanupCalls = 0;
  screenProps = null;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('Settings account deletion wiring', () => {
  it('acknowledgement 뒤 mutation 성공을 확인하고 local cleanup으로 위임한다', async () => {
    await renderRoute();

    assert.equal(screen().state.phase, 'idle');
    await act(async () => screen().onAcknowledgementChange(true));
    assert.equal(screen().state.acknowledged, true);

    await act(async () => screen().onConfirm());
    assert.equal(screen().state.phase, 'pending');
    assert.equal(mutationCalls.length, 1);
    assert.deepEqual(mutationCalls[0]?.variables, {});

    await act(async () =>
      mutationCalls[0]?.onCompleted({
        deleteAccount: { completed: true },
      }),
    );

    assert.equal(screen().state.phase, 'success');
    assert.equal(cleanupCalls, 1);
  });

  it('결과 불명 오류에서 acknowledgement를 유지하고 같은 mutation을 재시도한다', async () => {
    await renderRoute();
    await act(async () => screen().onAcknowledgementChange(true));
    await act(async () => screen().onConfirm());

    await act(async () => mutationCalls[0]?.onError(new Error('network failure')));

    assert.equal(screen().state.phase, 'error');
    assert.equal(screen().state.acknowledged, true);
    await act(async () => screen().onRetry());
    assert.equal(mutationCalls.length, 2);
    assert.equal(screen().state.phase, 'pending');
    assert.equal(cleanupCalls, 0);
  });

  it('eligibility blocker는 me의 Profile 개수만 presentation에 전달한다', async () => {
    queryData = {
      me: { profiles: [{ id: 'profile-1' }, { id: 'profile-2' }, { id: 'profile-3' }] },
    };

    await renderRoute();

    assert.deepEqual(screen().state, { activeProfileCount: 3, phase: 'blocked' });
  });
});

async function renderRoute() {
  await act(async () => {
    renderer = create(createElement(SettingsAccountDeletionRoute));
  });
  assert.ok(renderer);
}

function screen(): ScreenProps {
  assert.ok(screenProps);
  return screenProps;
}
