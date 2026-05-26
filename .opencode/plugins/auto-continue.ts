import type { Plugin } from '@opencode-ai/plugin';

const AUTO_CONTINUE_DELAY_MS = 3000;
const MAX_AUTO_CONTINUE_ATTEMPTS_PER_SESSION = 1;

export const AutoContinuePlugin: Plugin = async ({ client }) => {
  const autoContinueAttemptsBySession = new Map<string, number>();

  return {
    event: async ({ event }) => {
      if (
        event.type === 'session.error' &&
        event.properties.sessionID &&
        // opencode exposes timeout errors without a stable code as of @opencode-ai/plugin 1.15.10.
        event.properties.error?.data.message === 'The operation timed out.'
      ) {
        const sessionId = event.properties.sessionID;
        const attempts = autoContinueAttemptsBySession.get(sessionId) ?? 0;

        if (attempts >= MAX_AUTO_CONTINUE_ATTEMPTS_PER_SESSION) {
          return;
        }

        autoContinueAttemptsBySession.set(sessionId, attempts + 1);

        setTimeout(() => {
          client.session
            .promptAsync({
              path: { id: sessionId },
              body: {
                parts: [{ type: 'text', text: 'continue' }],
              },
            })
            .catch((error) => {
              console.warn('Failed to auto-continue opencode session', error);
            });
        }, AUTO_CONTINUE_DELAY_MS);
      }
    },
  };
};
