import type { FastifyInstance } from 'fastify';
import type { CampaignRepo } from '../repo/campaigns.ts';
import type { EventRepo } from '../repo/events.ts';
import { notFound } from './campaigns.ts';

type EventsRequest = { Params: { id: string }; Querystring: { user?: string; format?: string } };

const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export async function eventRoutes(app: FastifyInstance, opts: { campaigns: CampaignRepo; events: EventRepo }) {
  const { campaigns, events } = opts;

  app.get<EventsRequest>('/campaigns/:id/events', async (req, reply) => {
    if (!campaigns.get(req.params.id)) return notFound(reply);
    return events.listForCampaign(req.params.id, {
      user: nonEmpty(req.query.user),
      format: nonEmpty(req.query.format),
    });
  });

  app.get<EventsRequest>('/campaigns/:id/events/facets', async (req, reply) => {
    if (!campaigns.get(req.params.id)) return notFound(reply);
    return events.facets(req.params.id);
  });
}
