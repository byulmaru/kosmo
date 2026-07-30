import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  dirty: boolean;
  saving: boolean;
};

type PendingNavigationAction = {
  readonly payload?: object;
  readonly source?: string;
  readonly target?: string;
  readonly type: string;
};

export function useProfileEditNavigationGuard({ dirty, saving }: Options) {
  const navigation = useNavigation();
  const pendingAction = useRef<PendingNavigationAction | null>(null);
  const allowNavigation = useRef(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowNavigation.current || (!dirty && !saving)) {
          return;
        }

        event.preventDefault();
        if (saving || pendingAction.current) {
          return;
        }

        pendingAction.current = event.data.action;
        setDialogVisible(true);
      }),
    [dirty, navigation, saving],
  );

  const continueEditing = useCallback(() => {
    pendingAction.current = null;
    setDialogVisible(false);
  }, []);

  const discard = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setDialogVisible(false);
    if (!action) {
      return;
    }

    allowNavigation.current = true;
    navigation.dispatch({ ...action, target: undefined });
  }, [navigation]);

  const allowNextNavigation = useCallback(() => {
    allowNavigation.current = true;
    pendingAction.current = null;
    setDialogVisible(false);
  }, []);

  return {
    allowNextNavigation,
    dialogProps: {
      onContinue: continueEditing,
      onDiscard: discard,
      visible: dialogVisible,
    },
  };
}
