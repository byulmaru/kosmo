import type { Scope } from '@kosmo/shared/types/scope';

type HasScopeParams = {
  scope: Scope;
  sessionScopes: Scope[] | undefined;
};

export const hasScope = ({ scope, sessionScopes }: HasScopeParams) => {
  sessionScopes ??= [];
  if (sessionScopes[0] === '$superapp') {
    return true;
  }

  const splitedScope = scope.split(':');
  for (let i = splitedScope.length; i > 0; i--) {
    if (sessionScopes.includes(splitedScope.slice(0, i).join(':') as Scope)) {
      return true;
    }
  }

  return false;
};
