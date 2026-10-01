import type { FastifyInstance } from 'fastify';
import type { ApiError } from '@launchdeck/shared';
import type { AemClient } from '../aem/AemClient.ts';
import { FolderNotFoundError } from '../aem/AemClient.ts';
import { InvalidAemPathError, normalizeAemPath } from '../aem/MockAemClient.ts';

const DAM_ROOT = '/content/dam';

export async function folderRoutes(app: FastifyInstance, opts: { client: AemClient }) {
  app.get<{ Querystring: { path?: string } }>('/folders', async (req, reply) => {
    const raw = typeof req.query.path === 'string' && req.query.path !== '' ? req.query.path : DAM_ROOT;
    let path: string;
    try {
      path = normalizeAemPath(raw);
    } catch (err) {
      if (err instanceof InvalidAemPathError) {
        return reply.code(400).send({ error: 'Path must be under /content/dam' } satisfies ApiError);
      }
      throw err;
    }
    try {
      return await opts.client.listFolder(path);
    } catch (err) {
      if (err instanceof FolderNotFoundError) return reply.code(404).send({ error: 'NotFound' } satisfies ApiError);
      if (err instanceof InvalidAemPathError) {
        return reply.code(400).send({ error: 'Path must be under /content/dam' } satisfies ApiError);
      }
      req.log.warn({ folderPath: path, error: err instanceof Error ? err.message : String(err) }, 'listFolder failed');
      return reply.code(502).send({ error: 'AEM request failed' } satisfies ApiError);
    }
  });
}
