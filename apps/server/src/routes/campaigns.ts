import type { FastifyInstance, FastifyReply } from 'fastify';
import { campaignInput } from '@launchdeck/shared';
import type { ApiError, CampaignInput } from '@launchdeck/shared';
import type { CampaignRepo } from '../repo/campaigns.ts';
import type { ToCampaignView } from '../repo/campaignViews.ts';
import type { Bus } from '../watcher/bus.ts';
import type { Scheduler } from '../watcher/scheduler.ts';

type IdParams = { Params: { id: string } };

export interface CampaignRouteOptions {
  repo: CampaignRepo;
  toView: ToCampaignView;
  bus: Bus;
  scheduler: Pick<Scheduler, 'pollNow'>;
}

export const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'NotFound' } satisfies ApiError);

function parseInput(body: unknown, reply: FastifyReply): CampaignInput | undefined {
  const result = campaignInput.safeParse(body);
  if (result.success) return result.data;
  const error: ApiError = {
    error: 'ValidationError',
    issues: result.error.issues.map((i) => ({
      path: i.path.filter((p): p is string | number => typeof p !== 'symbol'),
      message: i.message,
    })),
  };
  void reply.code(400).send(error);
  return undefined;
}

export async function campaignRoutes(app: FastifyInstance, opts: CampaignRouteOptions) {
  const { repo, toView, bus, scheduler } = opts;

  const pollFolders = (folders: string[]) => void scheduler.pollNow(folders);

  app.get('/campaigns', async () => repo.list().map(toView));

  app.get<IdParams>('/campaigns/:id', async (req, reply) => {
    const c = repo.get(req.params.id);
    return c ? toView(c) : notFound(reply);
  });

  app.post('/campaigns', async (req, reply) => {
    const input = parseInput(req.body, reply);
    if (!input) return reply;
    const view = toView(repo.create(input));
    bus.publish({ type: 'campaign', action: 'created', campaign: view });
    pollFolders(view.folders);
    return reply.code(201).send(view);
  });

  app.put<IdParams>('/campaigns/:id', async (req, reply) => {
    const input = parseInput(req.body, reply);
    if (!input) return reply;
    const updated = repo.update(req.params.id, input);
    if (!updated) return notFound(reply);
    const view = toView(updated);
    bus.publish({ type: 'campaign', action: 'updated', campaign: view });
    pollFolders(view.folders);
    return view;
  });

  app.delete<IdParams>('/campaigns/:id', async (req, reply) => {
    if (!repo.delete(req.params.id)) return notFound(reply);
    bus.publish({ type: 'campaign', action: 'deleted', id: req.params.id });
    return reply.code(204).send();
  });

  app.post<IdParams>('/campaigns/:id/review', async (req, reply) => {
    const reviewed = repo.markReviewed(req.params.id);
    if (!reviewed) return notFound(reply);
    const view = toView(reviewed);
    bus.publish({ type: 'campaign', action: 'reviewed', campaign: view });
    return view;
  });
}
