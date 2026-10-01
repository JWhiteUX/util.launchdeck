import type { FastifyInstance } from 'fastify';
import type { Scheduler } from '../watcher/scheduler.ts';

export async function watcherRoutes(app: FastifyInstance, opts: { scheduler: Pick<Scheduler, 'health' | 'pollNow'> }) {
  app.get('/watcher/health', async () => opts.scheduler.health());

  /** Local convenience: re-polls AEM (read-only) immediately. */
  app.post('/watcher/poll', async (_req, reply) => {
    void opts.scheduler.pollNow();
    return reply.code(202).send({ queued: true });
  });
}
