export class StaleProfileBlockRequestError extends Error {
  constructor() {
    super('Profile block request belongs to an inactive Profile.');
    this.name = 'StaleProfileBlockRequestError';
  }
}
