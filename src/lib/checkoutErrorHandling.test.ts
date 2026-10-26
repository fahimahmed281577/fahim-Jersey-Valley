import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createJerseyValleyApp } from '../../server';
import {
  TransactionalStoreAdapter,
  UnconfiguredProductionPersistenceAdapter
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
