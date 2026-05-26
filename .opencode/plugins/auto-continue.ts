import type { Plugin } from '@opencode-ai/plugin';

export const AutoContinuePlugin: Plugin = async ({ client }) => {
  return {
    event: async ({ event }) => {
      if (
        event.type === 'session.error' &&
        event.properties.sessionID &&
        event.properties.error?.data.message === 'The operation timed out.'
      ) {
        const sessionId = event.properties.sessionID;
        setTimeout(() => {
          client.session.promptAsync({
            path: { id: sessionId },
            body: {
              parts: [{ type: 'text', text: 'continue' }],
            },
          });
        }, 3000);
      }
    },
  };
};
