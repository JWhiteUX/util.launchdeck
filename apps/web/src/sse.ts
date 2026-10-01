import { useEffect, useRef, useState } from 'react';
import type { StreamMessage } from '@launchdeck/shared';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting';

const EVENT_TYPES: StreamMessage['type'][] = ['campaign', 'change', 'health'];

/**
 * One EventSource on /api/stream for the whole app. EventSource reconnects on its own;
 * we only surface the connection state. `onMessage` may change between renders.
 */
export function useLiveStream(onMessage: (msg: StreamMessage) => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const handler = useRef(onMessage);

  useEffect(() => {
    handler.current = onMessage;
  });

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onopen = () => setStatus('open');
    source.onerror = () => setStatus('reconnecting');
    const listener = (e: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(e.data) as StreamMessage);
      } catch {
        // Ignore malformed frames; the next health/change message resyncs state.
      }
    };
    for (const type of EVENT_TYPES) source.addEventListener(type, listener);
    return () => source.close();
  }, []);

  return status;
}
