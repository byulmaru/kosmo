// Storybook 환경에서는 mearie client 없이 컴포넌트를 렌더해야 하므로 createFragment를
// 패스스루로 모킹한다. 스토리는 fragment ref 대신 평범한 데이터 객체를 prop으로 넘기고,
// 컴포넌트는 동일한 `fragment.data.*` 접근 패턴으로 데이터를 읽는다.
// `@mearie/svelte` 자체를 alias로 대체하므로 여기서 다시 import하면 순환 참조가 된다.
// 스토리에서 실제 실행하지 않는 hook은 호출 시 명확히 실패하도록 stub만 둔다.
import type {
  createFragment as CreateFragment,
  createMutation as CreateMutation,
  createQuery as CreateQuery,
  createSubscription as CreateSubscription,
  getClient as GetClient,
  setClient as SetClient,
} from '@mearie/svelte';

type Stub = (...args: unknown[]) => never;

const storybookOnly =
  (name: string): Stub =>
  () => {
    throw new Error(`@mearie/svelte#${name} is not available in Storybook stories`);
  };

export const createQuery = storybookOnly('createQuery') as unknown as typeof CreateQuery;
export const createMutation = (() => {
  const execute = async () => {
    throw new Error('@mearie/svelte#createMutation executor is not available in Storybook stories');
  };

  return [
    execute,
    {
      get data() {
        return undefined;
      },
      get loading() {
        return false;
      },
      get error() {
        return undefined;
      },
      get metadata() {
        return undefined;
      },
    },
  ];
}) as unknown as typeof CreateMutation;
export const createSubscription = storybookOnly(
  'createSubscription',
) as unknown as typeof CreateSubscription;
export const getClient = storybookOnly('getClient') as unknown as typeof GetClient;
export const setClient = storybookOnly('setClient') as unknown as typeof SetClient;

export const createFragment = ((_fragment: unknown, fragmentRef: () => unknown) => ({
  get data() {
    return fragmentRef();
  },
  get metadata() {
    return undefined;
  },
})) as unknown as typeof CreateFragment;
