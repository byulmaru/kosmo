type HandleUniversalError = (input: {
  error: unknown;
  status: number;
  message: string;
}) => PromiseLike<App.Error | void>;

export const handleError: HandleUniversalError = async ({ error }) => {
  if (error instanceof Error && error.message.startsWith('Relay: Missing @required value')) {
    return {
      message: 'error.common.pageNotFound',
    };
  }
};
