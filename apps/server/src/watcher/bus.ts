import { EventEmitter } from 'node:events';
import type { StreamMessage } from '@launchdeck/shared';

export type BusListener = (msg: StreamMessage) => void;

/** In-process pub/sub for SSE. A throwing subscriber never breaks the publisher or other subscribers. */
export class Bus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(msg: StreamMessage): void {
    this.emitter.emit('message', msg);
  }

  subscribe(fn: BusListener): () => void {
    const safe: BusListener = (msg) => {
      try {
        fn(msg);
      } catch {
        // one broken subscriber must not affect the rest
      }
    };
    this.emitter.on('message', safe);
    return () => {
      this.emitter.off('message', safe);
    };
  }

  get subscriberCount(): number {
    return this.emitter.listenerCount('message');
  }
}
