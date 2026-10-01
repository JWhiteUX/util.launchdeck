export const DEFAULT_CONCURRENCY = 4;

/** Counting semaphore: at most `limit` `run` callbacks are in flight; the rest wait FIFO. */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(readonly limit = DEFAULT_CONCURRENCY) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Semaphore limit must be a positive integer');
  }

  get inFlight(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }
}
