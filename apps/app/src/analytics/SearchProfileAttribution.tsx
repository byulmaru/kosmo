import { createContext, useEffect } from 'react';
import { searchProfileJourneys } from './searchProfileJourneys';
import type { SearchProfileJourney } from './searchProfileJourneys';

export const SearchProfileJourneyContext = createContext<
  (() => SearchProfileJourney | null) | null
>(null);

/** Mounted alongside the valid Profile chrome, including when its post list fails. */
export function SearchProfileView({ path, targetId }: { path: string; targetId: string }) {
  useEffect(() => {
    searchProfileJourneys.succeed(searchProfileJourneys.forRoute(path, targetId), targetId, 'view');
  }, [path, targetId]);
  return null;
}
