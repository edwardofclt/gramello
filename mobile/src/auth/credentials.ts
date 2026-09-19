import { SessionExpiredError } from '../lib/api';

// The SDK can refresh and save credentials while a logout is in progress.
// Serialize secure-store work and invalidate every previous request generation.
export class CredentialSession {
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private read: () => Promise<string>, private remove: () => Promise<void>) {}
  isCurrent(version: number) { return this.version === version; }
  advance() { return ++this.version; }
  settled() { return this.queue; }
  async getToken(version: number) {
    const operation = this.queue.then(async () => {
      if (!this.isCurrent(version)) throw new SessionExpiredError();
      return this.read();
    });
    this.queue = operation.catch(() => {});
    const token = await operation;
    if (!this.isCurrent(version)) throw new SessionExpiredError();
    return token;
  }
  clear() {
    const operation = this.queue.then(() => this.remove());
    this.queue = operation.catch(() => {});
    return operation;
  }
}

export function requiresSignIn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const type = 'type' in error ? error.type : undefined;
  return ['NO_CREDENTIALS', 'NO_REFRESH_TOKEN', 'INVALID_CREDENTIALS', 'SESSION_EXPIRED', 'RENEW_FAILED'].includes(String(type));
}
