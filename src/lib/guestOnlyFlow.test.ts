import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { createJerseyValleyApp } from '../../server';
import { TransactionalStoreAdapter } from './persistentStore';
import { createStandaloneAdminSession } from './serverAuth';

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

test('Guest Shopping Flow: unauthenticated visitor can browse, purchase COD, and track order', async () => {
  const store = new TransactionalStoreAdapter();
  const app = await createJerseyValleyApp({ store });

  await withServer(app, async (baseUrl) => {
    // 1. Guest browses catalog without any auth header
    const catalogRes = await fetch(`${baseUrl}/api/catalog`);
    assert.equal(catalogRes.status, 200);
    const catalogData = await catalogRes.json();
    assert.ok(Array.isArray(catalogData.products));
    assert.equal(catalogData.products.length, 10);

    // 2. Guest places Cash on Delivery order without customer login
    const orderPayload = {
      idempotencyKey: `guest-cod-${Date.now()}`,
      customerName: 'Tanvir Hossain',
      customerPhone: '01712345678',
      customerEmail: 'tanvir@gmail.com',
      division: 'Dhaka',
      district: 'Dhaka',
      upazila: 'Mirpur',
      streetAddress: 'House 14, Road 5, Block B, Mirpur-12',
      postalCode: '1216',
      deliveryNotes: 'Call before delivery',
      paymentMethod: 'COD',
      items: [
        {
          productId: 'bd-home-2026',
          size: 'L',
          quantity: 1,
          customName: 'HAMZA',
          customNumber: '8'
        }
      ]
    };

    const orderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    assert.equal(orderRes.status, 201, 'Guest order must succeed with 201 Created');
    const orderData = await orderRes.json();
    assert.ok(orderData.order);
    assert.ok(orderData.orderAccessToken);
    assert.equal(orderData.order.customerName, 'Tanvir Hossain');
    assert.equal(orderData.order.paymentMethod, 'COD');
    assert.equal(orderData.order.paymentStatus, 'UNPAID_COD');
    assert.equal(orderData.order.shippingBdt, 70, 'Inside Dhaka shipping must be 70 BDT');

    const orderNumber = orderData.order.orderNumber;
    const token = orderData.orderAccessToken;

    // 3. Guest tracking with orderAccessToken succeeds
    const trackRes = await fetch(`${baseUrl}/api/orders/${orderNumber}`, {
      headers: { 'x-order-access-token': token }
    });
    assert.equal(trackRes.status, 200, 'Tracking with valid access token must return 200');
    const trackData = await trackRes.json();
    assert.equal(trackData.order.orderNumber, orderNumber);
    assert.equal(trackData.order.items[0].customName, 'HAMZA');

    // 4. Stranger without token or phone verification cannot view order details (403)
    const unauthorizedTrack = await fetch(`${baseUrl}/api/orders/${orderNumber}`);
    assert.equal(unauthorizedTrack.status, 403, 'Unauthorized stranger must be blocked with 403');

    // 5. Guest tracking with customer phone verification succeeds
    const phoneTrack = await fetch(`${baseUrl}/api/orders/${orderNumber}?phone=01712345678`);
    assert.equal(phoneTrack.status, 200, 'Tracking with matching customer phone must return 200');

    // 6. Unauthorized visitor cannot access Admin API (401)
    const adminCheck = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(adminCheck.status, 401, 'Visitor must be denied admin access with 401');

    process.env.ADMIN_LOGIN_ID = 'test-admin';
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('testpass123', 10);
    process.env.ADMIN_SESSION_SECRET = 'test-secret-min-32-chars-long-abcdef12345';
    const { token: adminToken, payload } = createStandaloneAdminSession('test-admin', {
      ttlSeconds: 3600
    });
    const authorizedAdmin = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: {
        cookie: `jv_admin_session=${adminToken}`,
        'x-admin-csrf': payload.csrf
      }
    });
    assert.equal(authorizedAdmin.status, 200, 'Authorized admin must be granted access with 200');
  });
});
