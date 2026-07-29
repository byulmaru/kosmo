import { createContext, useContext } from 'react';
import type { ErrorInfo } from 'react';

export type UnexpectedErrorReporter = (error: unknown, info: ErrorInfo) => void;

export const UnexpectedErrorContext = createContext<UnexpectedErrorReporter | undefined>(undefined);

export function useUnexpectedErrorReporter(): UnexpectedErrorReporter | undefined {
  return useContext(UnexpectedErrorContext);
}
