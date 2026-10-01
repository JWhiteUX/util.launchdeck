import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { StreamMessage } from '@launchdeck/shared';
import type { Bus } from '../watcher/bus.ts';
import type { Scheduler } from '../watcher/scheduler.ts';

export const HEARTBEAT_MS = 15_000;

export const formatSse = (msg: StreamMessage): string => `event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`;

export async function streamRoutes(app: FastifyInstance, opts: { bus: Bus; scheduler: Pick<Scheduler, 'health'> }) {
  const open = new Set<ServerResponse>();

  // Long-lived responses would otherwise keep server.close() waiting.
  app.addHook('preClose', async () => {
    for (const res of open) res.end();
    open.clear();
  });

  app.get('/stream', async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    open.add(res);

    const send = (msg: StreamMessage) => {
      if (!res.writableEnded) res.write(formatSse(msg));
    };
    send({ type: 'health', health: opts.scheduler.health() });
    const unsubscribe = opts.bus.subscribe(send);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    heartbeat.unref();

    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      open.delete(res);
      req.log.debug({}, 'SSE client disconnected');
    });
  });
}
