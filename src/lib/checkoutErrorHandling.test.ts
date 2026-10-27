import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createJerseyValleyApp } from '../../server';
import handler from '../../api/index';
import {
  TransactionalStoreAdapter,
  UnconfiguredProductionPersistenceAdapter,
  parseServiceAccountCredentials,
  parsePrivateKey
} from './persistentStore';

async function withServer(
  app: Express.Application,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(app);
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

async function withVercelServer(
  customHandler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer((req, res) => {
    customHandler(req, res).catch((err) => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(err) }));
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

test('Checkout Error Handling: Unconfigured production persistence fails closed with HTTP 503 and JSON error body', async () => {
  const unconfiguredStore = new UnconfiguredProductionPersistenceAdapter();
  const app = await createJerseyValleyApp({ store: unconfiguredStore });

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `fail-closed-${Date.now()}`,
        customerName: 'Ashfaqur Rahman',
        customerPhone: '01711223344',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 5, Road 27, Dhanmondi',
        paymentMethod: 'COD',
        items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
      })
    });

    assert.equal(
      res.status,
      503,
      'Unconfigured production persistence must return HTTP 503 Service Unavailable'
    );
    const contentType = res.headers.get('content-type') || '';
    assert.ok(
      contentType.includes('application/json'),
      'Response must be valid application/json'
    );

    const body = (await res.json()) as { error: string };
    assert.ok(typeof body.error === 'string', 'Error message must be a string');
    assert.match(
      body.error,
      /Silent fallback to in-memory or local storage is disabled in production/i,
      'Error message must specify production persistence error'
    );
  });
});

test('Checkout Guest Placement: Valid guest checkout succeeds with 201 and valid tracking token', async () => {
  const store = new TransactionalStoreAdapter();
  const app = await createJerseyValleyApp({ store });

  await withServer(app, async (baseUrl) => {
    const idempotencyKey = `guest-test-${Date.now()}`;
    const payload = {
      idempotencyKey,
      customerName: 'Rafiqul Islam',
      customerPhone: '01812345678',
      customerEmail: 'rafiq@example.com',
      division: 'Chattogram',
      district: 'Chattogram',
      upazila: 'Pahartali',
      streetAddress: 'Road 3, House 12, Pahartali',
      postalCode: '4202',
      paymentMethod: 'COD',
      items: [
        {
          productId: 'bd-home-2026',
          size: 'XL',
          quantity: 1,
          customName: 'JAMAL',
          customNumber: '6'
        }
      ]
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201, 'Guest order must return 201 Created');
    const data = await res.json();
    assert.ok(data.order, 'Order data must be returned');
    assert.ok(data.orderAccessToken, 'Order access token must be returned');
    assert.equal(data.order.paymentMethod, 'COD');
    assert.equal(data.order.paymentStatus, 'UNPAID_COD');
    assert.equal(data.order.orderStatus, 'PENDING_CONFIRMATION');
    assert.equal(data.order.shippingBdt, 130, 'Outside Dhaka shipping rate must be ৳130');

    // Idempotent retry: resubmitting with same idempotencyKey returns 200 with original order
    const retryRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(retryRes.status, 200, 'Duplicate submission must return 200 OK');
    const retryData = await retryRes.json();
    assert.equal(retryData.duplicatePrevented, true, 'duplicatePrevented flag must be true');
    assert.equal(
      retryData.order.orderNumber,
      data.order.orderNumber,
      'Duplicate submission must return the exact same orderNumber'
    );
  });
});

test('Checkout Validation: Rejects invalid phone numbers and missing delivery addresses with HTTP 400', async () => {
  const store = new TransactionalStoreAdapter();
  const app = await createJerseyValleyApp({ store });

  await withServer(app, async (baseUrl) => {
    // 1. Invalid phone number
    const badPhoneRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `bad-phone-${Date.now()}`,
        customerName: 'Test Customer',
        customerPhone: '12345',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 1, Road 2',
        paymentMethod: 'COD',
        items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(badPhoneRes.status, 400);
    const badPhoneBody = await badPhoneRes.json();
    assert.ok(badPhoneBody.error.includes('11-digit Bangladesh mobile number'));

    // 2. Mismatched district and division
    const badDistrictRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `bad-district-${Date.now()}`,
        customerName: 'Test Customer',
        customerPhone: '01711223344',
        division: 'Dhaka',
        district: 'Chattogram', // does not belong to Dhaka division
        upazila: 'Pahartali',
        streetAddress: 'House 1, Road 2',
        paymentMethod: 'COD',
        items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(badDistrictRes.status, 400);
    const badDistrictBody = await badDistrictRes.json();
    assert.ok(badDistrictBody.error.includes('does not belong to'));
  });
});

test('Credential Sanitization: Robustly parses quoted JSON, base64, and escaped private keys', () => {
  // 1. Service account JSON wrapped in outer quotes
  const sampleJson = JSON.stringify({
    project_id: 'jerseyvalley-bd',
    client_email: 'service-account@jerseyvalley-bd.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\\n-----END PRIVATE KEY-----\\n'
  });
  const quotedJson = `"${sampleJson}"`;
  const parsedFromQuoted = parseServiceAccountCredentials(quotedJson);
  assert.equal(parsedFromQuoted.project_id, 'jerseyvalley-bd');
  assert.equal(parsedFromQuoted.client_email, 'service-account@jerseyvalley-bd.iam.gserviceaccount.com');

  // 2. Base64-encoded service account JSON
  const b64Json = Buffer.from(sampleJson, 'utf-8').toString('base64');
  const parsedFromB64 = parseServiceAccountCredentials(b64Json);
  assert.equal(parsedFromB64.project_id, 'jerseyvalley-bd');

  // 3. Private key with literal \n and outer quotes
  const quotedKey = '"-----BEGIN PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END PRIVATE KEY-----\\n"';
  const cleanKey = parsePrivateKey(quotedKey);
  assert.ok(cleanKey.includes('\nLINE1\nLINE2\n'));
  assert.ok(!cleanKey.startsWith('"'));
  assert.ok(!cleanKey.endsWith('"'));
});

test('Vercel Adapter Error Handling: Catches serverless exceptions and guarantees structured JSON', async () => {
  // Test that simulated database failure returns structured JSON HTTP 503
  const failingStore: any = {
    backendType: 'firestore-admin',
    createOrderAtomic: async () => {
      throw new Error('5 NOT_FOUND: Database (default) does not exist.');
    },
    getCatalogAndSettings: async () => ({
      products: [],
      coupons: [],
      settings: {} as any
    })
  };

  const app = await createJerseyValleyApp({ store: failingStore });
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `db-fail-${Date.now()}`,
        customerName: 'Karim Ullah',
        customerPhone: '01712345678',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Mirpur',
        streetAddress: 'House 10, Road 4, Mirpur',
        paymentMethod: 'COD',
        items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
      })
    });

    assert.equal(res.status, 503, 'Database NOT_FOUND error must return 503');
    const body = await res.json();
    assert.ok(body.error.includes('Production database error'));
    assert.ok(body.error.includes('jerseyvalley-bd'));
    assert.ok(body.error.includes('(default)'));
  });
});

test('COD-Only Enforcement: Rejects BKASH and NAGAD payment methods with HTTP 400 and defaults omitted paymentMethod to COD', async () => {
  const store = new TransactionalStoreAdapter();
  const app = await createJerseyValleyApp({ store });

  await withServer(app, async (baseUrl) => {
    for (const disallowedMethod of ['BKASH', 'NAGAD']) {
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `disallow-${disallowedMethod}-${Date.now()}`,
          customerName: 'Tanvir Ahmed',
          customerPhone: '01711223344',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Dhanmondi',
          streetAddress: 'House 8, Road 5, Dhanmondi',
          paymentMethod: disallowedMethod,
          items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
        })
      });

      assert.equal(res.status, 400, `${disallowedMethod} must be rejected with HTTP 400`);
      const body = await res.json();
      assert.match(body.error, /Only Cash on Delivery \(COD\) is available/i);
    }

    // Omitted paymentMethod defaults cleanly to COD + UNPAID_COD
    const codRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `default-cod-${Date.now()}`,
        customerName: 'Tanvir Ahmed',
        customerPhone: '01711223344',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 8, Road 5, Dhanmondi',
        items: [{ productId: 'bd-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(codRes.status, 201);
    const codData = await codRes.json();
    assert.equal(codData.order.paymentMethod, 'COD');
    assert.equal(codData.order.paymentStatus, 'UNPAID_COD');
  });
});

test('Firestore Payload Sanitization: sanitizeForFirestore recursively removes undefined fields while preserving null and valid values', async () => {
  const { sanitizeForFirestore } = await import('./persistentStore');
  const rawPayload = {
    id: 'prod-1',
    salePriceBdt: undefined,
    appliedCouponCode: null,
    nested: {
      keep: 1350,
      omitMe: undefined
    },
    items: [
      { sku: 'JV-1', note: undefined, qty: 2 }
    ]
  };

  const sanitized = sanitizeForFirestore(rawPayload);
  assert.equal('salePriceBdt' in sanitized, false);
  assert.equal(sanitized.appliedCouponCode, null);
  assert.equal('omitMe' in sanitized.nested, false);
  assert.equal(sanitized.nested.keep, 1350);
  assert.equal('note' in sanitized.items[0], false);
  assert.equal(sanitized.items[0].qty, 2);
});

