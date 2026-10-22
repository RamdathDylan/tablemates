import { placesSearchQuery } from '@tablemates/shared';
import type { FastifyInstance } from 'fastify';

import type { Deps } from '../deps';
import { parse } from '../lib/errors';

export function placeRoutes(app: FastifyInstance, { places }: Deps) {
  // Proxied so the Google API key never ships in the client.
  app.get('/places/search', async (req) => places.search(parse(placesSearchQuery, req.query)));
}
