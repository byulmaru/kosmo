export class UnrecoverableError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnrecoverableError';
  }
}

export class ExternalServerError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExternalServerError';
  }
}
