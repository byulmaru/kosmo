import { createContext, useContext } from 'react';
import { RelayEnvironmentProvider } from 'react-relay';
import type { PropsWithChildren, RefObject } from 'react';
import type { Environment } from 'relay-runtime';

const RelayEnvironmentGenerationContext = createContext<RefObject<number> | null>(null);

export function RelayEnvironmentBoundary({
  children,
  environment,
  generationRef,
}: PropsWithChildren<{ environment: Environment; generationRef: RefObject<number> }>) {
  return (
    <RelayEnvironmentGenerationContext.Provider value={generationRef}>
      <RelayEnvironmentProvider environment={environment}>{children}</RelayEnvironmentProvider>
    </RelayEnvironmentGenerationContext.Provider>
  );
}

export function useRelayEnvironmentGeneration(): RefObject<number> | null {
  return useContext(RelayEnvironmentGenerationContext);
}
