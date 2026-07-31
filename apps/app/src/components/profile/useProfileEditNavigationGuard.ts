import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigationGuard } from '@/components/shell/NavigationGuardContext';
import type { GuardedNavigationAction } from '@/components/shell/NavigationGuardContext';

type Options = {
  dirty: boolean;
  saving: boolean;
};

export function useProfileEditNavigationGuard({ dirty, saving }: Options) {
  const navigation = useNavigation();
  const { register } = useNavigationGuard();
  const pendingAction = useRef<GuardedNavigationAction | null>(null);
  const allowedAction = useRef<GuardedNavigationAction | null>(null);
  const [navigationAllowed, setNavigationAllowed] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const requestNavigation = useCallback(
    (action: GuardedNavigationAction) => {
      if (navigationAllowed || (!dirty && !saving)) {
        return false;
      }
      if (saving || pendingAction.current) {
        return true;
      }

      pendingAction.current = action;
      setDialogVisible(true);
      return true;
    },
    [dirty, navigationAllowed, saving],
  );

  useEffect(() => register(requestNavigation), [register, requestNavigation]);

  usePreventRemove((dirty || saving) && !navigationAllowed, ({ data }) => {
    requestNavigation(() => navigation.dispatch({ ...data.action, target: undefined }));
  });

  useEffect(() => {
    if (!navigationAllowed) {
      return;
    }

    const action = allowedAction.current;
    allowedAction.current = null;
    if (!action) {
      return;
    }
    action();
    setNavigationAllowed(false);
  }, [navigationAllowed]);

  const continueEditing = useCallback(() => {
    pendingAction.current = null;
    setDialogVisible(false);
  }, []);

  const allowNextNavigation = useCallback((action: GuardedNavigationAction) => {
    allowedAction.current = action;
    pendingAction.current = null;
    setDialogVisible(false);
    setNavigationAllowed(true);
  }, []);

  const discard = useCallback(() => {
    const action = pendingAction.current;
    if (!action) {
      return;
    }
    allowNextNavigation(action);
  }, [allowNextNavigation]);

  return {
    allowNextNavigation,
    dialogProps: {
      onContinue: continueEditing,
      onDiscard: discard,
      visible: dialogVisible,
    },
  };
}
