import { createContext } from 'react';

export const StoryArgsUpdaterContext = createContext<
  ((args: Record<string, unknown>) => void) | null
>(null);
