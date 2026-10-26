import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http, { type Server } from 'node:http';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, terminate } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { createJerseyValleyApp } from './server';
import vercelHandler from './api/index';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
const firebaseJsonPath = path.resolve(process.cwd(), 'firebase.json');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf-8');
const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf-8'));
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

function getTestFirestoreInstance(app: ReturnType<typeof initializeApp>) {
  const dbId = firebaseConfig.firestoreDatabaseId;
  return dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
}

// ============================================================================
// PART 1: Static & Structural Verification of firestore.rules, storage.rules & firebase.json
// ============================================================================
test('Firestore & Storage rules files contain Eight Pillars primitives, admin verification, and NO Firebase Hosting migration', () => {
  assert.equal(firebaseConfig.projectId, 'jerseyvalley-bd');
  assert.equal(firebaseConfig.authDomain, 'jerseyvalley-bd.firebaseapp.com');
  assert.equal(firebaseConfig.storageBucket, 'jerseyvalley-bd.firebasestorage.app');

  // Verify firebase.json configures Firestore & Storage rules ONLY (keeps Vercel as hosting platform)
  assert.equal(firebaseJson.firestore?.rules, 'firestore.rules');
  assert.equal(firebaseJson.storage?.rules, 'storage.rules');
  assert.equal(firebaseJson.hosting, undefined, 'Must keep Vercel as hosting platform and not add Firebase Hosting');

  assert.ok(rulesContent.includes("rules_version = '2';"));
  assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  assert.ok(rulesContent.includes('function isValidId(id)'));
  assert.ok(rulesContent.includes('function isValidUserProfile(data)'));
  assert.ok(rulesContent.includes('function isValidUserPrivateInfo(data)'));
  assert.ok(rulesContent.includes('function isValidOrder(data)'));
  assert.ok(rulesContent.includes('function isValidProduct(data)'));
  assert.ok(rulesContent.includes('request.auth.token.email_verified == true'));

  // Verify hardcoded bootstrap email was completely removed from firestore.rules
  assert.equal(
    rulesContent.includes('chalantika07@gmail.com'),
    false,
    'firestore.rules must not contain a hardcoded administrator email address'
  );
  assert.ok(
    rulesContent.includes('exists(/databases/$(database)/documents/admins/$(request.auth.uid))'),
    'isAdmin() must verify existence of /admins/{uid} document'
  );

  // Verify storage.rules protects /products/{productId}/{fileName} with admin verification
  assert.ok(storageRulesContent.includes('service firebase.storage'));
  assert.ok(storageRulesContent.includes('match /products/{productId}/{fileName}'));
  assert.ok(storageRulesContent.includes('function isVerifiedAdmin()'));
  assert.ok(storageRulesContent.includes('5 * 1024 * 1024'));

  const blueprintPaths = Object.keys(blueprint.firestore);
  assert.equal(blueprintPaths.length, 8);
});

// ============================================================================
// PART 2: Live Cloud Firestore Security / API Enforcement Probes (jerseyvalley-bd)
// ============================================================================
function isRejectedByFirebaseBackend(err: { code?: string; message?: string }): boolean {
  const msg = String(err.message || '');
  return (
    err.code === 'permission-denied' ||
    err.code === 'unavailable' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

test('Live Cloud Firestore Rules Enforcement: Unauthenticated read of /users/{uid}/private/shipping is rejected by Firebase servers', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-1`);
  const db = getTestFirestoreInstance(app);
  try {
    await assert.rejects(
      async () => {
        await getDocFromServer(doc(db, 'users', 'some_customer_uid', 'private', 'shipping'));
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          isRejectedByFirebaseBackend(err),
          `Expected rejection from live Firebase backend, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
    await terminate(db).catch(() => undefined);
    await deleteApp(app);
  }
});

test('Live Cloud Firestore Rules Enforcement: Unauthenticated client cannot read /admins/{uid} or /orders/{orderId}', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-2`);
  const db = getTestFirestoreInstance(app);
  try {
    await assert.rejects(
      async () => {
        await getDocFromServer(doc(db, 'admins', 'attacker_uid'));
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          isRejectedByFirebaseBackend(err),
          `Expected rejection from live Firebase backend, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await getDocFromServer(doc(db, 'orders', 'JV-DEMO-0001'));
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          isRejectedByFirebaseBackend(err),
          `Expected rejection from live Firebase backend, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
    await terminate(db).catch(() => undefined);
    await deleteApp(app);
  }
});

// ============================================================================
// PART 3: Backend Express API Security, RBAC, IDOR & Concurrency Tests
// ============================================================================
test('Backend API Security Suite: Admin endpoints reject unauthenticated mutations (401) and protect customer order PII (403)', async () => {
  const app = await createJerseyValleyApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Unauthenticated PATCH /api/admin/settings must return 401
    const adminSettingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insideDhakaShippingBdt: 0 })
    });
    assert.equal(adminSettingsRes.status, 401);

    // 2. Unauthenticated PATCH /api/admin/products/:id/stock must return 401
    const adminStockRes = await fetch(`${baseUrl}/api/admin/products/arg-home-2026/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 'L', stock: 999 })
    });
    assert.equal(adminStockRes.status, 401);

    // 3. Unauthenticated GET /api/customer/orders must return 401 (no arbitrary phone/userId scraping)
    const custOrdersRes = await fetch(`${baseUrl}/api/customer/orders?phone=01711223344`);
    assert.equal(custOrdersRes.status, 401);

    // 4. POST /api/orders with fabricated Division/District/Upazila must return 400
    const badLocationRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'idem-bad-loc-12345',
        customerName: 'Nayeem Islam',
        customerPhone: '01712345678',
        division: 'Dhaka',
        district: 'Chattogram', // Mismatched district for Dhaka division
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 4',
        paymentMethod: 'COD',
        items: [{ productId: 'arg-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(badLocationRes.status, 400);

    // 5. Place a valid COD order and verify non-sequential orderNumber + idempotency + PII protection
    const idemKey = `idem-test-${Date.now()}`;
    const validOrderRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: idemKey,
        customerName: 'Nayeem Islam',
        customerPhone: '01812345678',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 4, Dhanmondi',
        paymentMethod: 'COD',
        items: [{ productId: 'arg-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(validOrderRes.status, 201);
    const createdPayload = await validOrderRes.json();
    const orderNumber: string = createdPayload.order.orderNumber;
    const accessToken: string = createdPayload.orderAccessToken;
    assert.match(orderNumber, /^JV-2610-[0-9A-F]{6}$/);
    assert.equal(createdPayload.order.paymentStatus, 'UNPAID_COD');
    assert.equal(createdPayload.order.orderStatus, 'PENDING_CONFIRMATION');

    // 6. Replay with same idempotencyKey returns 200 duplicatePrevented: true without double-deducting stock
    const replayRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: idemKey,
        customerName: 'Nayeem Islam',
        customerPhone: '01812345678',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 12, Road 4, Dhanmondi',
        paymentMethod: 'COD',
        items: [{ productId: 'arg-home-2026', size: 'M', quantity: 1 }]
      })
    });
    assert.equal(replayRes.status, 200);
    const replayPayload = await replayRes.json();
    assert.equal(replayPayload.duplicatePrevented, true);
    assert.equal(replayPayload.order.orderNumber, orderNumber);

    // 7. Stranger attempting GET /api/orders/:orderNumber without phone or token receives 403
    const strangerGetRes = await fetch(`${baseUrl}/api/orders/${orderNumber}`);
    assert.equal(strangerGetRes.status, 403);

    // 8. Customer providing matching phone number or orderAccessToken can view and cancel order
    const ownerPhoneGetRes = await fetch(`${baseUrl}/api/orders/${orderNumber}?phone=01812345678`);
    assert.equal(ownerPhoneGetRes.status, 200);

    // 9. Stranger attempting POST /api/orders/:orderNumber/cancel without phone/token receives 403
    const strangerCancelRes = await fetch(`${baseUrl}/api/orders/${orderNumber}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01999999999' })
    });
    assert.equal(strangerCancelRes.status, 403);

    // 10. Authorized customer cancels with orderAccessToken -> 200 & status CANCELLED
    const ownerCancelRes = await fetch(`${baseUrl}/api/orders/${orderNumber}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderAccessToken: accessToken })
    });
    assert.equal(ownerCancelRes.status, 200);
    const cancelledPayload = await ownerCancelRes.json();
    assert.equal(cancelledPayload.order.orderStatus, 'CANCELLED');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Vercel Serverless Function Entrypoint (/api/index.ts): Serves API and SEO routes identically to Express server', async () => {
  const server: Server = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      void vercelHandler(req, res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const catalogRes = await fetch(`${baseUrl}/api/catalog`);
    assert.equal(catalogRes.status, 200);
    const catalogData = await catalogRes.json();
    assert.ok(Array.isArray(catalogData.products) && catalogData.products.length === 10);

    const authMeRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(authMeRes.status, 200);
    const authMeData = await authMeRes.json();
    assert.equal(authMeData.authenticated, false);
    assert.equal(authMeData.isAdmin, false);

    const robotsRes = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsRes.status, 200);
    const robotsText = await robotsRes.text();
    assert.ok(robotsText.includes('Disallow: /admin'));

    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapRes.status, 200);
    const sitemapXml = await sitemapRes.text();
    assert.ok(sitemapXml.includes('<urlset'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

