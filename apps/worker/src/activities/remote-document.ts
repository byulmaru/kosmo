import type { DocumentLoader } from '@fedify/vocab';

const REQUEST_TIMEOUT_MS = 30_000;

export class RemoteDocumentBudgetExceededError extends Error {
  constructor(
    readonly documentBytes: number,
    readonly maxDocumentBytes: number,
  ) {
    super(`Remote document budget exceeded (${documentBytes} > ${maxDocumentBytes} bytes)`);
    this.name = 'RemoteDocumentBudgetExceededError';
  }
}

export class RemoteDocumentLoaderTypeError extends Error {
  constructor(cause: TypeError) {
    super(cause.message, { cause });
    this.name = 'RemoteDocumentLoaderTypeError';
  }
}

const parsedDocumentBytes = (document: unknown): number => {
  const serialized = JSON.stringify(document);
  return serialized === undefined ? 0 : new TextEncoder().encode(serialized).byteLength;
};

export const createBoundedDocumentLoader = (
  loader: DocumentLoader,
  maxDocumentBytes: number,
): { readonly documentLoader: DocumentLoader; readonly documentBytes: number } => {
  let documentBytes = 0;

  return {
    documentLoader: async (url, options) => {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const signal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      let loaded: Awaited<ReturnType<DocumentLoader>>;
      try {
        loaded = await loader(url, { ...options, signal });
      } catch (error) {
        if (error instanceof TypeError) {
          throw new RemoteDocumentLoaderTypeError(error);
        }
        throw error;
      }
      documentBytes += parsedDocumentBytes(loaded.document);
      if (documentBytes > maxDocumentBytes) {
        throw new RemoteDocumentBudgetExceededError(documentBytes, maxDocumentBytes);
      }
      return loaded;
    },
    get documentBytes() {
      return documentBytes;
    },
  };
};
