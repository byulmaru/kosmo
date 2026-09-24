import { useEffect, useEffectEvent, useRef } from 'react';
import { Platform, Pressable } from 'react-native';
import type { RefObject } from 'react';
import type { PressableProps, View } from 'react-native';

export type OverlayCloseReason = 'escape' | 'backdrop' | 'native-back';

type OverlayLifecycleProps = {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  focusScopeRef?: RefObject<View | null>;
  open: boolean;
  onRequestClose: (reason: OverlayCloseReason) => void;
  preferredFocusRef?: RefObject<HTMLElement | View | null>;
  shouldRestoreFocus?: () => boolean;
  triggerFocusRef?: RefObject<HTMLElement | null>;
};

export function useOverlayLifecycle({
  fallbackFocusRef,
  focusScopeRef,
  open,
  onRequestClose,
  preferredFocusRef,
  shouldRestoreFocus: shouldRestoreFocusCallback,
  triggerFocusRef,
}: OverlayLifecycleProps) {
  const dialogRef = useRef<View>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const hasWebDocument = Platform.OS === 'web' && typeof document !== 'undefined';
  const shouldRestoreFocus = useEffectEvent(shouldRestoreFocusCallback ?? (() => true));

  useEffect(() => {
    if (!hasWebDocument) {
      return;
    }

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = open;
    if (!open) {
      return;
    }

    return () => {
      if (!shouldRestoreFocus()) {
        return;
      }
      requestAnimationFrame(() => {
        const preferredFocus = preferredFocusRef?.current as HTMLElement | null;
        const triggerFocus = triggerFocusRef?.current;
        const restoredFocus = restoreFocusRef.current;
        const fallbackFocus = fallbackFocusRef?.current;
        const focusTarget =
          preferredFocus && document.contains(preferredFocus)
            ? preferredFocus
            : triggerFocus && document.contains(triggerFocus)
              ? triggerFocus
              : restoredFocus !== document.body &&
                  restoredFocus !== null &&
                  document.contains(restoredFocus)
                ? restoredFocus
                : fallbackFocus;
        if (focusTarget && document.contains(focusTarget)) {
          focusTarget.focus();
        }
      });
    };
  }, [fallbackFocusRef, hasWebDocument, open, preferredFocusRef, triggerFocusRef]);

  useEffect(() => {
    if (!hasWebDocument || !open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [hasWebDocument, open]);

  useEffect(() => {
    if (!hasWebDocument || !open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const focusScope = (focusScopeRef?.current ??
        dialogRef.current) as unknown as HTMLElement | null;
      if (event.key === 'Escape') {
        if (
          focusScope?.querySelector(
            '[role="menu"], [role="radiogroup"], [data-testid="post-composer-profile-picker"]',
          )
        ) {
          return;
        }
        event.preventDefault();
        onRequestClose('escape');
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        focusScope?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusScope?.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [focusScopeRef, hasWebDocument, onRequestClose, open]);

  return { dialogRef, requestClose: onRequestClose };
}

type OverlayBackdropProps = Omit<PressableProps, 'onPress'> & {
  onRequestClose: (reason: OverlayCloseReason) => void;
};

export function OverlayBackdrop({ onRequestClose, ...props }: OverlayBackdropProps) {
  return <Pressable {...props} onPress={() => onRequestClose('backdrop')} />;
}
