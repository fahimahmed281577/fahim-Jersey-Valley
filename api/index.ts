import type { IncomingMessage, ServerResponse } from 'node:http';
import { createJerseyValleyApp } from '../server';

let cachedAppPromise: ReturnType<typeof createJerseyValleyApp> | null = null;

/**
 * Vercel Serverless Function entrypoint for all /api/*, /robots.txt, and /sitemap.xml routes.
 * Preserves all Express routes, input validation, idempotency, and Firebase JWT RBAC middleware.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Normalize req.url on Vercel:
  // When vercel.json rewrites /api/(.*) -> /api/index?path=/api/$1,
  // Vercel sets req.url to /api/index or provides the original path in headers / query params.
  const rawUrl = req.url || '';
  let resolvedUrl = rawUrl;

  const xForwardedUri = req.headers['x-forwarded-uri'] as string | undefined;
  const xMatchedPath = req.headers['x-matched-path'] as string | undefined;
  const xVercelMatched = req.headers['x-vercel-matched-path'] as string | undefined;

  const candidateHeader = xForwardedUri || xMatchedPath || xVercelMatched;
  if (
    candidateHeader &&
    (rawUrl === '/api/index' || rawUrl === '/api/index/' || rawUrl.startsWith('/api/index?'))
  ) {
    resolvedUrl = candidateHeader;
  } else if (rawUrl.startsWith('/api/index?')) {
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      const routeParam = parsed.searchParams.get('path') || parsed.searchParams.get('route');
      if (routeParam) {
        resolvedUrl = routeParam.startsWith('/') ? routeParam : `/${routeParam}`;
      }
    } catch {
      // ignore URL parsing failure
    }
  }

  // Ensure resolvedUrl starts with /api if it's an API route (e.g. if Vercel stripped /api):
  if (
    resolvedUrl &&
    !resolvedUrl.startsWith('/api') &&
    !resolvedUrl.startsWith('/robots.txt') &&
    !resolvedUrl.startsWith('/sitemap.xml')
  ) {
    resolvedUrl = `/api${resolvedUrl.startsWith('/') ? '' : '/'}${resolvedUrl}`;
  }

  req.url = resolvedUrl;

  try {
    if (!cachedAppPromise) {
      cachedAppPromise = createJerseyValleyApp();
    }
    const app = await cachedAppPromise;

    // Returning a Promise that waits for the response stream to finish flushing guarantees that
    // Vercel's serverless runtime will not prematurely freeze the execution context while Express
    // computes bcrypt verification, formats HttpOnly cookies, and streams the JSON response.
    return await new Promise<void>((resolve) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err) => {
        console.error('[Vercel Serverless Stream Error]', err);
        resolve();
      });

      // Cast req and res as any for Express application handler invocation
      (app as any)(req, res, (err?: unknown) => {
        if (err) {
          console.error('[Vercel Serverless Handler Error]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  err instanceof Error
                    ? `Server execution error: ${err.message}`
                    : 'An internal server error occurred.',
                statusCode: 500
              })
            );
          }
        }
        resolve();
      });
    });
  } catch (fatalErr) {
    console.error('[Vercel Serverless Fatal Initialization Error]', fatalErr);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error:
            fatalErr instanceof Error
              ? `Server initialization error: ${fatalErr.message}`
              : 'Server initialization failed.',
          statusCode: 500
        })
      );
    }
  }
}
