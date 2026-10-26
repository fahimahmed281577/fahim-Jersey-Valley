import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from '../../api/index';
import { TransactionalStoreAdapter } from './persistentStore';
import { createJerseyValleyApp } from '../../server';
import bcrypt from 'bcryptjs';

async function withVercelServer(
  customHandler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer((req, res) => {
    customHandler(req, res).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test('Vercel serverless routing: restores req.url from query param path, x-forwarded-uri, and handles OPTIONS preflight', async () => {
  process.env.ADMIN_LOGIN_ID = 'jvadmin';
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('Fahim@@2007', 10);
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret-at-least-32-chars-long-12345';

  await withVercelServer(handler, async (baseUrl) => {
    // 1. Test CORS preflight OPTIONS request
    const optionsRes = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://jerseyvalley.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, X-Requested-With'
      }
    });
    assert.equal(optionsRes.status, 204, 'OPTIONS preflight must respond with 204');
    assert.equal(
      optionsRes.headers.get('access-control-allow-origin'),
      'https://jerseyvalley.vercel.app'
    );
    assert.equal(optionsRes.headers.get('access-control-allow-credentials'), 'true');

    // 2. Test Vercel rewrite with query param: /api/index?path=/api/admin/auth/session
    const sessionRewriteRes = await fetch(`${baseUrl}/api/index?path=/api/admin/auth/session`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    assert.equal(sessionRewriteRes.status, 200, 'Rewrite with path query must route to session endpoint');
    const sessionData = await sessionRewriteRes.json();
    assert.equal(sessionData.standaloneConfigured, true);
    assert.equal(sessionData.authenticated, false);

    // 3. Test Vercel rewrite with x-forwarded-uri header: /api/index with x-forwarded-uri: /api/admin/auth/session
    const headerRewriteRes = await fetch(`${baseUrl}/api/index`, {
      headers: {
        'x-forwarded-uri': '/api/admin/auth/session',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    assert.equal(headerRewriteRes.status, 200, 'Rewrite with x-forwarded-uri must route to session endpoint');

    // 4. Test Vercel login with query param: /api/index?path=/api/admin/auth/login
    const loginRes = await fetch(`${baseUrl}/api/index?path=/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        adminId: 'jvadmin',
        password: 'Fahim@@2007'
      })
    });
    assert.equal(loginRes.status, 200, 'Login via Vercel serverless adapter must return 200 OK');
    const loginData = await loginRes.json();
    assert.equal(loginData.authenticated, true);
    assert.equal(loginData.adminId, 'jvadmin');
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('jv_admin_session='), 'Must set jv_admin_session cookie');

    // 5. Test unknown API endpoint returns JSON 404, never HTML
    const notFoundRes = await fetch(`${baseUrl}/api/nonexistent-endpoint-test`);
    assert.equal(notFoundRes.status, 404, 'Unmatched /api/* route must return 404');
    const notFoundType = notFoundRes.headers.get('content-type') || '';
    assert.ok(notFoundType.includes('application/json'), 'Unmatched route must return JSON, not HTML');
    const notFoundData = await notFoundRes.json();
    assert.equal(notFoundData.error, 'API endpoint not found.');

    // 6. Test invalid password returns JSON 401 with structured error
    const invalidPassRes = await fetch(`${baseUrl}/api/index?path=/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        adminId: 'jvadmin',
        password: 'IncorrectPassword999!'
      })
    });
    assert.equal(invalidPassRes.status, 401, 'Invalid password must return 401');
    const invalidData = await invalidPassRes.json();
    assert.equal(invalidData.error, 'Invalid Admin ID or password.');

    // 7. Test quoted env vars handling (e.g. if user pasted quotes into Vercel UI)
    process.env.ADMIN_LOGIN_ID = '"jvadmin"';
    process.env.ADMIN_PASSWORD_HASH = `"${bcrypt.hashSync('Fahim@@2007', 10)}"`;
    process.env.ADMIN_SESSION_SECRET = '"test-session-secret-at-least-32-chars-long-12345"';

    const quotedLoginRes = await fetch(`${baseUrl}/api/index?path=/api/admin/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        adminId: 'jvadmin',
        password: 'Fahim@@2007'
      })
    });
    assert.equal(quotedLoginRes.status, 200, 'Login with quoted env variables must succeed');
  });
});
