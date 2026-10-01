import type { FastifyInstance, FastifyReply } from 'fastify';
import { campaignInput } from '@launchdeck/shared';
import type { ApiError, CampaignInput } from '@launchdeck/shared';
import type { CampaignRepo } from '../repo/campaigns.ts';

type IdParams = { Params: { id: string } };

const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'NotFound' } satisfies ApiError);

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

export async function campaignRoutes(app: FastifyInstance, opts: { repo: CampaignRepo }) {
  const { repo } = opts;

  app.get('/campaigns', async () => repo.list());

  app.get<IdParams>('/campaigns/:id', async (req, reply) => repo.get(req.params.id) ?? notFound(reply));

  app.post('/campaigns', async (req, reply) => {
    const input = parseInput(req.body, reply);
    if (!input) return reply;
    return reply.code(201).send(repo.create(input));
  });

  app.put<IdParams>('/campaigns/:id', async (req, reply) => {
    const input = parseInput(req.body, reply);
    if (!input) return reply;
    return repo.update(req.params.id, input) ?? notFound(reply);
  });

  app.delete<IdParams>('/campaigns/:id', async (req, reply) =>
    repo.delete(req.params.id) ? reply.code(204).send() : notFound(reply),
  );

  app.post<IdParams>('/campaigns/:id/review', async (req, reply) => repo.markReviewed(req.params.id) ?? notFound(reply));
}
