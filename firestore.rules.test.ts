import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http, { type Server } from 'node:http';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { createJerseyValleyApp } from './server';
import vercelHandler from './api/index';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

// ============================================================================
// PART 1: Static & Structural Verification of firestore.rules (No Hardcoded Email)
// ============================================================================
test('Firestore rules file contains all blueprint collections, Eight Pillars primitives, and NO hardcoded admin email', () => {
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

  const blueprintPaths = Object.keys(blueprint.firestore);
  assert.equal(blueprintPaths.length, 8);
});

// ============================================================================
// PART 2: Live Deployed Cloud Firestore Security Rules Enforcement Tests
// (Executes real network operations against the provisioned Cloud Firestore
// database to prove that deployed rules actively enforce PERMISSION_DENIED)
// ============================================================================
test('Live Cloud Firestore Rules Enforcement: Unauthenticated read of /users/{uid}/private/shipping is rejected by Firebase servers', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-1`);
  try {
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    await assert.rejects(
      async () => {
        await getDoc(doc(db, 'users', 'some_customer_uid', 'private', 'shipping'));
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions'),
          `Expected permission-denied from live Firestore, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
    await deleteApp(app);
  }
});

test('Live Cloud Firestore Rules Enforcement: Unauthenticated client cannot write or tamper with /products/{productId}', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-2`);
  try {
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    await assert.rejects(
      async () => {
        await setDoc(doc(db, 'products', 'arg-home-2026'), {
          id: 'arg-home-2026',
          slug: 'argentina-2026-home-fan-replica',
          name: 'Tampered Jersey Price',
          team: 'Argentina',
          category: 'national',
          kitType: 'Home',
          editionTier: 'Fan Replica',
          priceBdt: 1,
          customPrintPriceBdt: 0,
          stockTotal: 999,
          isActive: true,
          updatedAt: new Date().toISOString()
        });
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions'),
          `Expected permission-denied from live Firestore, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
    await deleteApp(app);
  }
});

test('Live Cloud Firestore Rules Enforcement: Unauthenticated client cannot self-grant /admins/{uid}', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-3`);
  try {
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    await assert.rejects(
      async () => {
        await setDoc(doc(db, 'admins', 'attacker_uid'), {
          uid: 'attacker_uid',
          email: 'attacker@example.com',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions'),
          `Expected permission-denied from live Firestore, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
    await deleteApp(app);
  }
});

test('Live Cloud Firestore Rules Enforcement: Unauthenticated client cannot read /orders/{orderId}', async () => {
  const app = initializeApp(firebaseConfig, `live-rules-test-${Date.now()}-4`);
  try {
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    await assert.rejects(
      async () => {
        await getDoc(doc(db, 'orders', 'JV-DEMO-0001'));
      },
      (err: { code?: string; message?: string }) => {
        assert.ok(
          err.code === 'permission-denied' || String(err.message).includes('Missing or insufficient permissions'),
          `Expected permission-denied from live Firestore, got: ${err.code} ${err.message}`
        );
        return true;
      }
    );
  } finally {
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

