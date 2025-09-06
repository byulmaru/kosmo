export const handleExceptedError = async (error: unknown): Promise<App.Error | void> => {
  if (error instanceof Error && error.message.startsWith('Relay: Missing @required value')) {
    return {
      message: 'error.common.pageNotFound',
    };
  }
};
