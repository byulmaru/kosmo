import type { AppStateStatus } from 'react-native';

type StartupAppState = {
  currentState: AppStateStatus | null;
  addEventListener: (
    event: 'change',
    listener: (state: AppStateStatus) => void,
  ) => { remove: () => void };
};

export class NativeStartupRecovery {
  private pending = true;
  private sessionPending = true;
  private routeReady = false;

  constructor(private readonly appState: StartupAppState) {}

  complete(): void {
    this.routeReady = true;
    if (!this.sessionPending) {
      this.pending = false;
    }
  }

  sessionReady(): void {
    this.sessionPending = false;
    if (this.routeReady) {
      this.pending = false;
    }
  }

  changeActor(): void {
    if (this.pending) {
      this.sessionPending = true;
      this.routeReady = false;
    }
  }

  finish(): void {
    this.pending = false;
  }

  async execute(send: () => Promise<Response>): Promise<Response> {
    if (!this.pending) {
      return send();
    }

    let state = this.appState.currentState;
    let interrupted = state === 'background' || state === 'inactive';
    let resume: (() => void) | undefined;
    const subscription = this.appState.addEventListener('change', (next) => {
      state = next;
      if (next === 'background' || next === 'inactive') {
        interrupted = true;
      } else if (next === 'active') {
        resume?.();
      }
    });

    try {
      return await send().catch(async (error: unknown) => {
        if (!interrupted) {
          throw error;
        }
        if (state !== 'active') {
          await new Promise<void>((resolve) => {
            resume = resolve;
          });
        }
        // Only the original fetch has a recovery handler; the retry cannot renew its budget.
        return send();
      });
    } finally {
      subscription.remove();
    }
  }
}
