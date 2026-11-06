import { Platform } from 'react-native';

type PlayStoreInstallPromptEvent = Event & {
  platforms: string[];
  prompt: () => Promise<void>;
};

let availablePrompt: PlayStoreInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function captureBeforeInstallPrompt(event: Event) {
  const installPrompt = event as PlayStoreInstallPromptEvent;
  if (!Array.isArray(installPrompt.platforms) || !installPrompt.platforms.includes('play')) {
    return;
  }

  event.preventDefault();
  availablePrompt = installPrompt;
  listeners.forEach((listener) => listener());
}

export function subscribePlayStoreInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlayStoreInstallPrompt() {
  return availablePrompt;
}

export function consumePlayStoreInstallPrompt() {
  const installPrompt = availablePrompt;
  if (installPrompt) {
    availablePrompt = null;
    listeners.forEach((listener) => listener());
  }
  return installPrompt;
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // Register before React mounts so a prompt fired during session startup is not lost.
  window.addEventListener('beforeinstallprompt', captureBeforeInstallPrompt);
}
