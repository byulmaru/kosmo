import { createContext, useContext } from 'react';
import type { ErrorInfo } from 'react';

export type UnexpectedErrorReporter = (error: unknown, info: ErrorInfo) => string | undefined;

export const UnexpectedErrorContext = createContext<UnexpectedErrorReporter | undefined>(undefined);
export const SafeErrorNavigationContext = createContext<(() => void) | undefined>(undefined);

export function useUnexpectedErrorReporter(): UnexpectedErrorReporter | undefined {
  return useContext(UnexpectedErrorContext);
}

export function useSafeErrorNavigation(): (() => void) | undefined {
  return useContext(SafeErrorNavigationContext);
}
