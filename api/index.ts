import type { IncomingMessage, ServerResponse } from 'node:http';
import { createJerseyValleyApp } from '../server';

let cachedAppPromise: ReturnType<typeof createJerseyValleyApp> | null = null;

/**
 * Vercel Serverless Function entrypoint for all /api/*, /robots.txt, and /sitemap.xml routes.
 * Preserves all Express routes, input validation, idempotency, and Firebase JWT RBAC middleware.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cachedAppPromise) {
    cachedAppPromise = createJerseyValleyApp();
  }
  const app = await cachedAppPromise;
  return app(req, res);
}
