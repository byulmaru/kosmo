import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { startWebLogin } from '@/auth/webLogin';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { useSession } from '@/session/SessionProvider';
import { resolvePostActionExecution } from './postActionAvailability';
import type { PropsWithChildren } from 'react';
import type { PostActionExecution, PostActionResolutionReason } from './postActionAvailability';

type PostActionAuthenticationValue = Readonly<{
  resolve: (reason: PostActionResolutionReason) => void;
  selectedProfileId: string | null;
  status: 'error' | 'guest' | 'valid';
}>;

const PostActionAuthenticationContext = createContext<PostActionAuthenticationValue | undefined>(
  undefined,
);

export function PostActionAuthenticationProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const session = useSession();
  const shellChrome = useShellChrome();
  const resolve = useCallback(
    (reason: PostActionResolutionReason) => {
      if (reason === 'profile') {
        if (shellChrome) {
          shellChrome.openProfileSwitcher();
        } else {
          throw new Error('Profile resolution에는 ShellChromeProvider가 필요합니다.');
        }
        return;
      }
      if (Platform.OS === 'web') {
        startWebLogin();
      } else {
        router.push('/');
      }
    },
    [router, shellChrome],
  );
  const value = useMemo<PostActionAuthenticationValue>(
    () => ({
      resolve,
      selectedProfileId: session.selectedProfileId,
      status: session.status,
    }),
    [resolve, session.selectedProfileId, session.status],
  );

  return (
    <PostActionAuthenticationContext.Provider value={value}>
      {children}
    </PostActionAuthenticationContext.Provider>
  );
}

export function usePostActionAuthentication(targetEligible: boolean): Readonly<{
  execution: PostActionExecution;
  resolve: (reason: PostActionResolutionReason) => void;
  selectedProfileId: string | null;
}> {
  const authentication = useContext(PostActionAuthenticationContext);
  if (!authentication) {
    throw new Error('Post action 표현부에는 PostActionAuthenticationProvider가 필요합니다.');
  }

  return {
    execution: resolvePostActionExecution({
      selectedProfileId: authentication.selectedProfileId,
      status: authentication.status,
      targetEligible,
    }),
    resolve: authentication.resolve,
    selectedProfileId: authentication.selectedProfileId,
  };
}
