import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import {
  FirestoreAdminPersistenceAdapter,
  TransactionalStoreAdapter
} from './persistentStore';
import { createJerseyValleyApp } from '../../server';

/**
 * In-memory transactional Firestore harness that implements the exact
 * `firebase-admin/firestore` surface used by `FirestoreAdminPersistenceAdapter`
 * (`collection`, `doc`, `where`, `batch`, and serialized `runTransaction`).
 * This allows testing `FirestoreAdminPersistenceAdapter` transaction semantics
 * and multi-instance serverless state sharing without mutating live production data.
 */
function createMockAdminFirestore(): Firestore {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let txChain: Promise<unknown> = Promise.resolve();

  function getCollectionMap(name: string): Map<string, Record<string, unknown>> {
    let col = collections.get(name);
    if (!col) {
      col = new Map();
      collections.set(name, col);
    }
    return col;
  }

  function makeDocRef(colName: string, docId: string) {
    return {
      id: docId,
      path: `${colName}/${docId}`,
      _colName: colName,
      _docId: docId,
      async get() {
        const col = getCollectionMap(colName);
        const raw = col.get(docId);
        return {
          id: docId,
          exists: raw !== undefined,
          data: () => (raw ? structuredClone(raw) : undefined)
        };
      },
      async set(data: Record<string, unknown>) {
        const col = getCollectionMap(colName);
        col.set(docId, structuredClone(data));
      },
      async delete() {
        const col = getCollectionMap(colName);
        col.delete(docId);
      }
    };
  }

  const mockDb = {
    collection(colName: string) {
      return {
        doc(docId: string) {
          return makeDocRef(colName, docId);
        },
        async get() {
          const col = getCollectionMap(colName);
          const docs = Array.from(col.entries()).map(([id, value]) => ({
            id,
            exists: true,
            data: () => structuredClone(value)
          }));
          return {
            empty: docs.length === 0,
            docs
          };
        },
        where(field: string, op: string, value: unknown) {
          return {
            async get() {
              const col = getCollectionMap(colName);
              const docs = Array.from(col.entries())
                .filter(([, docData]) => op === '==' && docData[field] === value)
                .map(([id, docData]) => ({
                  id,
                  exists: true,
                  data: () => structuredClone(docData)
                }));
              return {
                empty: docs.length === 0,
                docs
              };
            }
          };
        }
      };
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        set(docRef: { _colName: string; _docId: string }, data: Record<string, unknown>) {
          ops.push(() => {
            getCollectionMap(docRef._colName).set(docRef._docId, structuredClone(data));
          });
        },
        delete(docRef: { _colName: string; _docId: string }) {
          ops.push(() => {
            getCollectionMap(docRef._colName).delete(docRef._docId);
          });
        },
        async commit() {
          for (const op of ops) {
            op();
          }
        }
      };
    },
    async runTransaction<T>(
      updateFn: (tx: {
        get: (docRef: { _colName: string; _docId: string }) => Promise<{
          id: string;
          exists: boolean;
          data: () => Record<string, unknown> | undefined;
        }>;
        set: (docRef: { _colName: string; _docId: string }, data: Record<string, unknown>) => void;
        delete: (docRef: { _colName: string; _docId: string }) => void;
      }) => Promise<T>
    ): Promise<T> {
      const next = txChain.then(async () => {
        const stagedOps: Array<
          | { type: 'set'; colName: string; docId: string; data: Record<string, unknown> }
          | { type: 'delete'; colName: string; docId: string }
        > = [];
        const tx = {
          async get(docRef: { _colName: string; _docId: string }) {
            const raw = getCollectionMap(docRef._colName).get(docRef._docId);
            return {
              id: docRef._docId,
              exists: raw !== undefined,
              data: () => (raw ? structuredClone(raw) : undefined)
            };
          },
          set(docRef: { _colName: string; _docId: string }, data: Record<string, unknown>) {
            stagedOps.push({
              type: 'set',
              colName: docRef._colName,
              docId: docRef._docId,
              data: structuredClone(data)
            });
          },
          delete(docRef: { _colName: string; _docId: string }) {
            stagedOps.push({
              type: 'delete',
              colName: docRef._colName,
              docId: docRef._docId
            });
          }
        };
        const result = await updateFn(tx);
        for (const op of stagedOps) {
          if (op.type === 'set') {
            getCollectionMap(op.colName).set(op.docId, op.data);
          } else {
            getCollectionMap(op.colName).delete(op.docId);
          }
        }
        return result;
      });
      txChain = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    }
  };

  return mockDb as unknown as Firestore;
}

async function withServer(
  app: Awaited<ReturnType<typeof createJerseyValleyApp>>,
  fn: (baseUrl: string) => Promise<void>
) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral test port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('FirestoreAdminPersistenceAdapter shares guest orders, stock deductions, and settings across separate serverless instances', async () => {
  const sharedFirestore = createMockAdminFirestore();

  // Simulate two separate Vercel Serverless Function instances backed by the same Firestore database
  const storeInstanceA = new FirestoreAdminPersistenceAdapter(sharedFirestore);
  const storeInstanceB = new FirestoreAdminPersistenceAdapter(sharedFirestore);

  const appInstanceA = await createJerseyValleyApp({ store: storeInstanceA });
  const appInstanceB = await createJerseyValleyApp({ store: storeInstanceB });

  let createdOrderNumber = '';
  let createdAccessToken = '';

  await withServer(appInstanceA, async (urlA) => {
    const createRes = await fetch(`${urlA}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'serverless-cross-instance-key-0001',
        customerName: 'Tanvir Ahmed',
        customerPhone: '01712345678',
        customerEmail: 'tanvir@example.com',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        streetAddress: 'House 14, Road 5, Dhanmondi',
        postalCode: '1209',
        deliveryNotes: 'Call before delivery',
        paymentMethod: 'COD',
        couponCode: 'VALLEY10',
        items: [
          {
            productId: 'bd-home-2026',
            size: 'L',
            quantity: 2,
            customName: 'TANVIR',
            customNumber: '10'
          }
        ]
      })
    });

    assert.equal(createRes.status, 201);
    const body = (await createRes.json()) as {
      order: { orderNumber: string; totalBdt: number };
      orderAccessToken: string;
    };
    createdOrderNumber = body.order.orderNumber;
    createdAccessToken = body.orderAccessToken;
    assert.match(createdOrderNumber, /^JV-2610-[0-9A-F]{6}$/);
    assert.ok(createdAccessToken.length >= 24);
  });

  // Update site settings via storeInstanceA and verify on appInstanceB
  await storeInstanceA.updateSiteSettingsAtomic({
    insideDhakaShippingBdt: 95,
    outsideDhakaShippingBdt: 155
  });

  await withServer(appInstanceB, async (urlB) => {
    // 1. Instance B sees updated shipping settings and deducted stock (bd-home-2026 size L started at 14, now 12)
    const catalogRes = await fetch(`${urlB}/api/catalog`);
    assert.equal(catalogRes.status, 200);
    const catalogBody = (await catalogRes.json()) as {
      settings: { insideDhakaShippingBdt: number; outsideDhakaShippingBdt: number };
      products: Array<{ id: string; variants: Array<{ size: string; stock: number }> }>;
    };
    assert.equal(storeInstanceB.backendType, 'firestore-admin');
    assert.equal(catalogBody.settings.insideDhakaShippingBdt, 95);
    assert.equal(catalogBody.settings.outsideDhakaShippingBdt, 155);

    const bdJersey = catalogBody.products.find((p) => p.id === 'bd-home-2026');
    const sizeL = bdJersey?.variants.find((v) => v.size === 'L');
    assert.equal(sizeL?.stock, 12);

    // 2. Instance B enforces ownership / access token on guest order lookup
    const unauthorizedLookup = await fetch(`${urlB}/api/orders/${createdOrderNumber}`);
    assert.equal(unauthorizedLookup.status, 403);

    // 3. Instance B retrieves the guest order when valid X-Order-Access-Token is supplied
    const authorizedLookup = await fetch(`${urlB}/api/orders/${createdOrderNumber}`, {
      headers: { 'X-Order-Access-Token': createdAccessToken }
    });
    assert.equal(authorizedLookup.status, 200);
    const lookupData = (await authorizedLookup.json()) as {
      order: { orderNumber: string; orderStatus: string; orderAccessToken?: string };
    };
    assert.equal(lookupData.order.orderNumber, createdOrderNumber);
    assert.equal(lookupData.order.orderStatus, 'PENDING_CONFIRMATION');
    assert.equal(lookupData.order.orderAccessToken, undefined, 'Public order response must strip orderAccessToken');

    // 4. Instance B cancels the guest order and restores stock back to 14
    const cancelRes = await fetch(`${urlB}/api/orders/${createdOrderNumber}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Order-Access-Token': createdAccessToken
      },
      body: JSON.stringify({})
    });
    assert.equal(cancelRes.status, 200);

    const afterCancelCatalog = await storeInstanceA.getCatalogAndSettings();
    const restoredBdJersey = afterCancelCatalog.products
      .find((p) => p.id === 'bd-home-2026')
      ?.variants.find((v) => v.size === 'L');
    assert.equal(restoredBdJersey?.stock, 14);
  });
});

test('Concurrent stock reservation prevents overselling when 5 simultaneous orders compete for 2 remaining jerseys', async () => {
  const sharedFirestore = createMockAdminFirestore();
  const store = new FirestoreAdminPersistenceAdapter(sharedFirestore);

  // Set stock of arg-home-2026 size M to exactly 2 units
  await store.updateVariantStockAtomic({
    productId: 'arg-home-2026',
    size: 'M',
    stock: 2
  });

  const app = await createJerseyValleyApp({ store, rateLimitMaxRequests: 100 });

  await withServer(app, async (baseUrl) => {
    const requests = Array.from({ length: 5 }, (_, index) =>
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `concurrent-race-order-key-${index}-${Date.now()}`,
          customerName: `Customer ${index}`,
          customerPhone: '01812345678',
          customerEmail: `customer${index}@example.com`,
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Mirpur',
          streetAddress: 'Block C, Section 10, Mirpur',
          postalCode: '1216',
          deliveryNotes: '',
          paymentMethod: 'COD',
          items: [
            {
              productId: 'arg-home-2026',
              size: 'M',
              quantity: 1
            }
          ]
        })
      })
    );

    const responses = await Promise.all(requests);
    const statusCodes = responses.map((r) => r.status);
    const createdCount = statusCodes.filter((code) => code === 201).length;
    const conflictCount = statusCodes.filter((code) => code === 409).length;

    assert.equal(createdCount, 2, 'Exactly 2 orders must succeed when stock is 2');
    assert.equal(conflictCount, 3, 'Remaining 3 concurrent orders must fail with 409 Conflict');

    const { products } = await store.getCatalogAndSettings();
    const argVariantM = products
      .find((p) => p.id === 'arg-home-2026')
      ?.variants.find((v) => v.size === 'M');
    assert.equal(argVariantM?.stock, 0, 'Final stock must be 0 and never negative');
  });
});

test('Duplicate idempotent order submissions return the original order and deduct inventory only once', async () => {
  const sharedFirestore = createMockAdminFirestore();
  const store = new FirestoreAdminPersistenceAdapter(sharedFirestore);

  await store.updateVariantStockAtomic({
    productId: 'arg-home-2026',
    size: 'L',
    stock: 5
  });

  const app = await createJerseyValleyApp({ store });

  await withServer(app, async (baseUrl) => {
    const payload = {
      idempotencyKey: 'idempotent-replay-key-99999',
      customerName: 'Nafis Karim',
      customerPhone: '01912345678',
      customerEmail: 'nafis@example.com',
      division: 'Chattogram',
      district: 'Chattogram',
      upazila: 'Panchlaish',
      streetAddress: 'Road 3, Nasirabad Housing Society',
      postalCode: '4000',
      deliveryNotes: '',
      paymentMethod: 'COD',
      items: [
        {
          productId: 'arg-home-2026',
          size: 'L',
          quantity: 2
        }
      ]
    };

    const [res1, res2, res3] = await Promise.all([
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    ]);

    const body1 = (await res1.json()) as {
      order: { orderNumber: string };
      orderAccessToken: string;
      duplicatePrevented?: boolean;
    };
    const body2 = (await res2.json()) as {
      order: { orderNumber: string };
      orderAccessToken: string;
      duplicatePrevented?: boolean;
    };
    const body3 = (await res3.json()) as {
      order: { orderNumber: string };
      orderAccessToken: string;
      duplicatePrevented?: boolean;
    };

    assert.equal(body1.order.orderNumber, body2.order.orderNumber);
    assert.equal(body2.order.orderNumber, body3.order.orderNumber);
    assert.equal(body1.orderAccessToken, body2.orderAccessToken);

    const { products } = await store.getCatalogAndSettings();
    const argVariantL = products
      .find((p) => p.id === 'arg-home-2026')
      ?.variants.find((v) => v.size === 'L');
    assert.equal(argVariantL?.stock, 3, 'Stock must be deducted only once (5 - 2 = 3)');
  });
});

test('TransactionalStoreAdapter persists state to disk snapshot and enforces admin RBAC and rate limits', async () => {
  const tempFile = path.join(os.tmpdir(), `jv-store-test-${Date.now()}.json`);
  try {
    const store1 = new TransactionalStoreAdapter({ snapshotFilePath: tempFile });
    await store1.updateSiteSettingsAtomic({ freeShippingThresholdBdt: 4200 });

    // Create a second adapter reading from the same snapshot file
    const store2 = new TransactionalStoreAdapter({ snapshotFilePath: tempFile });
    const { settings } = await store2.getCatalogAndSettings();
    assert.equal(settings.freeShippingThresholdBdt, 4200);

    const app = await createJerseyValleyApp({
      store: store2,
      rateLimitMaxRequests: 3,
      rateLimitWindowMs: 60_000
    });

    await withServer(app, async (baseUrl) => {
      // Unauthenticated admin access is rejected with 401
      const adminRes = await fetch(`${baseUrl}/api/admin/overview`);
      assert.equal(adminRes.status, 401);

      // Exceed rate limit of 3 requests per window on /api/orders/:orderNumber
      await fetch(`${baseUrl}/api/orders/JV-2610-000001`);
      await fetch(`${baseUrl}/api/orders/JV-2610-000002`);
      await fetch(`${baseUrl}/api/orders/JV-2610-000003`);
      const rateLimitedRes = await fetch(`${baseUrl}/api/orders/JV-2610-000004`);
      assert.equal(rateLimitedRes.status, 429);
    });
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
});

test('Admin Panel RBAC & Cold-Start Persistence: 401 unauthenticated, 403 non-admin, 200 authorized admin, product CRUD, stock logs, COD verification rules, token redaction, and demo order exclusion', async () => {
  const previousAdminUids = process.env.ADMIN_UIDS;
  process.env.ADMIN_UIDS = 'authorized_admin_uid_001';

  try {
    const sharedFirestore = createMockAdminFirestore();
    const storeInstanceA = new FirestoreAdminPersistenceAdapter(sharedFirestore);
    const storeInstanceB = new FirestoreAdminPersistenceAdapter(sharedFirestore);

    const mockTokenVerifier = async (rawToken: string) => {
      const token = rawToken.trim();
      if (token === 'valid-admin-token') {
        return {
          uid: 'authorized_admin_uid_001',
          email: 'owner@jerseyvalley.bd',
          emailVerified: true,
          isAdminClaim: false,
          rawClaims: {}
        };
      }
      if (token === 'unverified-admin-token') {
        return {
          uid: 'authorized_admin_uid_001',
          email: 'owner@jerseyvalley.bd',
          emailVerified: false,
          isAdminClaim: false,
          rawClaims: {}
        };
      }
      if (token === 'regular-customer-token') {
        return {
          uid: 'customer_uid_999',
          email: 'customer@example.com',
          emailVerified: true,
          isAdminClaim: false,
          rawClaims: {}
        };
      }
      throw new Error('Invalid Firebase ID token');
    };

    const appInstanceA = await createJerseyValleyApp({
      store: storeInstanceA,
      tokenVerifier: mockTokenVerifier,
      rateLimitMaxRequests: 200
    });
    const appInstanceB = await createJerseyValleyApp({
      store: storeInstanceB,
      tokenVerifier: mockTokenVerifier,
      rateLimitMaxRequests: 200
    });

    let genuineOrderNumber = '';

    await withServer(appInstanceA, async (urlA) => {
      // 1. Unauthenticated requests to all protected admin endpoints must return 401
      const unauthOverview = await fetch(`${urlA}/api/admin/overview`);
      assert.equal(unauthOverview.status, 401);

      const unauthCustomers = await fetch(`${urlA}/api/admin/customers`);
      assert.equal(unauthCustomers.status, 401);

      const unauthCreateProd = await fetch(`${urlA}/api/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(unauthCreateProd.status, 401);

      // 2. Authenticated non-admin customer receives 403 Forbidden
      const customerHeaders = {
        Authorization: 'Bearer regular-customer-token',
        'Content-Type': 'application/json'
      };
      const nonAdminOverview = await fetch(`${urlA}/api/admin/overview`, { headers: customerHeaders });
      assert.equal(nonAdminOverview.status, 403);

      const nonAdminCustomers = await fetch(`${urlA}/api/admin/customers`, { headers: customerHeaders });
      assert.equal(nonAdminCustomers.status, 403);

      const nonAdminStock = await fetch(`${urlA}/api/admin/products/arg-home-2026/stock`, {
        method: 'PATCH',
        headers: customerHeaders,
        body: JSON.stringify({ size: 'M', stock: 50 })
      });
      assert.equal(nonAdminStock.status, 403);

      // 3. Admin UID with unverified email receives 403 Forbidden
      const unverifiedAdminOverview = await fetch(`${urlA}/api/admin/overview`, {
        headers: { Authorization: 'Bearer unverified-admin-token' }
      });
      assert.equal(unverifiedAdminOverview.status, 403);

      // 4. Place a genuine COD order first so we can verify stats, COD rules, and token redaction
      const orderCreateRes = await fetch(`${urlA}/api/orders`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer regular-customer-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idempotencyKey: 'admin-suite-genuine-order-001',
          customerName: 'Farhan Sadik',
          customerPhone: '01755667788',
          customerEmail: 'customer@example.com',
          division: 'Dhaka',
          district: 'Dhaka',
          upazila: 'Uttara',
          streetAddress: 'Sector 7, Road 12, Uttara',
          postalCode: '1230',
          deliveryNotes: 'Deliver after 4 PM',
          paymentMethod: 'COD',
          items: [
            {
              productId: 'arg-home-2026',
              size: 'M',
              quantity: 2,
              customName: 'MESSI',
              customNumber: '10'
            }
          ]
        })
      });
      assert.equal(orderCreateRes.status, 201);
      const orderCreateBody = (await orderCreateRes.json()) as {
        order: { orderNumber: string; paymentStatus: string; totalBdt: number };
      };
      genuineOrderNumber = orderCreateBody.order.orderNumber;
      assert.equal(
        orderCreateBody.order.paymentStatus,
        'UNPAID_COD',
        'Newly created COD orders must remain UNPAID_COD'
      );

      // 5. Authorized administrator receives 200 on /api/admin/overview; demo order is excluded from metrics and orderAccessToken is stripped
      const adminHeaders = {
        Authorization: 'Bearer valid-admin-token',
        'Content-Type': 'application/json'
      };
      const adminOverviewRes = await fetch(`${urlA}/api/admin/overview`, { headers: adminHeaders });
      assert.equal(adminOverviewRes.status, 200);
      const overviewBody = (await adminOverviewRes.json()) as {
        metrics: {
          totalOrders: number;
          demoOrdersCount: number;
          pendingOrdersCount: number;
          totalSalesCompletedBdt: number;
          totalRevenueBookedBdt: number;
        };
        orders: Array<{
          orderNumber: string;
          isDemoOrder?: boolean;
          orderAccessToken?: string;
          idempotencyKey?: string;
        }>;
      };
      assert.equal(
        overviewBody.metrics.totalOrders,
        1,
        'totalOrders must count only genuine orders and exclude DEMO_SEED_ORDER'
      );
      assert.equal(overviewBody.metrics.demoOrdersCount, 1);
      assert.equal(
        overviewBody.metrics.totalSalesCompletedBdt,
        0,
        'totalSalesCompletedBdt must be 0 before order is delivered/verified and must exclude demo seed order'
      );
      for (const ord of overviewBody.orders) {
        assert.equal(ord.orderAccessToken, undefined, 'Admin overview must never expose orderAccessToken');
        assert.equal(ord.idempotencyKey, undefined, 'Admin overview must never expose idempotencyKey');
      }

      // 6. Authorized administrator creates a new product with salePriceBdt and imageUrls
      const createProductRes = await fetch(`${urlA}/api/admin/products`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          name: 'AC Milan 2025/26 Home Fan Replica Jersey',
          team: 'AC Milan',
          countryOrLeague: 'Serie A',
          category: 'club',
          kitType: 'Home',
          season: '2025/26',
          editionTier: 'Fan Replica',
          gender: 'Unisex',
          priceBdt: 1750,
          salePriceBdt: 1490,
          customPrintPriceBdt: 350,
          description:
            'High-grade supporter replica football jersey in classic Rossoneri stripes. Supporter replica apparel, not officially licensed merchandise.',
          fabricSpec: '100% recycled breathable polyester mesh with woven club crest.',
          fitNote: 'Regular supporter fit.',
          careInstructions: 'Machine wash cold inside out.',
          isActive: true,
          imageUrls: ['https://firebasestorage.googleapis.com/v0/b/demo/o/ac-milan-front.jpg?alt=media'],
          variants: [
            { size: 'S', stock: 6, sku: 'JV-ACM-25-S', isActive: true },
            { size: 'M', stock: 10, sku: 'JV-ACM-25-M', isActive: true },
            { size: 'L', stock: 8, sku: 'JV-ACM-25-L', isActive: true }
          ]
        })
      });
      assert.equal(createProductRes.status, 201);
      const createdProdBody = (await createProductRes.json()) as {
        product: { id: string; salePriceBdt: number; imageUrls: string[] };
      };
      const createdProductId = createdProdBody.product.id;
      assert.equal(createdProdBody.product.salePriceBdt, 1490);
      assert.equal(createdProdBody.product.imageUrls.length, 1);

      // 7. Authorized administrator adjusts stock and records timestamped StockAdjustmentLog
      const adjustStockRes = await fetch(`${urlA}/api/admin/products/${createdProductId}/stock`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          size: 'M',
          stock: 18,
          reason: 'RESTOCK_SHIPMENT_DHAKA'
        })
      });
      assert.equal(adjustStockRes.status, 200);

      // 8. Authorized administrator updates store settings and adds a coupon
      const settingsUpdateRes = await fetch(`${urlA}/api/admin/settings`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          insideDhakaShippingBdt: 75,
          outsideDhakaShippingBdt: 135,
          supportPhone: '+880 1711-998877',
          supportEmail: 'help@jerseyvalley.bd',
          storeAddress: 'Banani Road 11, Dhaka, Bangladesh'
        })
      });
      assert.equal(settingsUpdateRes.status, 200);

      const couponCreateRes = await fetch(`${urlA}/api/admin/coupons`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          code: 'EID2026',
          description: '15% off orders over 2000 BDT',
          discountType: 'PERCENTAGE',
          value: 15,
          minSubtotalBdt: 2000,
          maxDiscountBdt: 500,
          isActive: true
        })
      });
      assert.equal(couponCreateRes.status, 201);
    });

    // 9. Verify on Serverless Instance B (Cold Start) that product, stock log, settings, coupon, and order updates persist
    await withServer(appInstanceB, async (urlB) => {
      const adminHeaders = {
        Authorization: 'Bearer valid-admin-token',
        'Content-Type': 'application/json'
      };

      // Progress order through CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED + VERIFIED on Instance B
      for (const nextStatus of ['CONFIRMED', 'PROCESSING', 'SHIPPED'] as const) {
        const stepRes = await fetch(`${urlB}/api/admin/orders/${genuineOrderNumber}`, {
          method: 'PATCH',
          headers: adminHeaders,
          body: JSON.stringify({ orderStatus: nextStatus })
        });
        assert.equal(stepRes.status, 200);
      }

      const deliverRes = await fetch(`${urlB}/api/admin/orders/${genuineOrderNumber}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({
          orderStatus: 'DELIVERED',
          paymentStatus: 'VERIFIED'
        })
      });
      assert.equal(deliverRes.status, 200);

      const overviewResB = await fetch(`${urlB}/api/admin/overview`, { headers: adminHeaders });
      assert.equal(overviewResB.status, 200);
      const overviewB = (await overviewResB.json()) as {
        metrics: {
          totalOrders: number;
          deliveredOrdersCount: number;
          totalSalesCompletedBdt: number;
        };
        products: Array<{ id: string; name: string; salePriceBdt?: number | null; variants: Array<{ size: string; stock: number }> }>;
        stockLogs: Array<{ productId: string; size: string; previousStock: number; newStock: number; delta: number; reason: string; actorEmail: string }>;
        coupons: Array<{ code: string; value: number }>;
        settings: { insideDhakaShippingBdt: number; supportPhone: string };
      };

      assert.equal(overviewB.metrics.totalOrders, 1);
      assert.equal(overviewB.metrics.deliveredOrdersCount, 1);
      assert.ok(overviewB.metrics.totalSalesCompletedBdt > 0, 'Delivered & verified genuine order must count in totalSalesCompletedBdt');

      const acMilan = overviewB.products.find((p) => p.name.includes('AC Milan'));
      assert.ok(acMilan, 'Created product must persist across serverless cold starts');
      assert.equal(acMilan.salePriceBdt, 1490);
      assert.equal(acMilan.variants.find((v) => v.size === 'M')?.stock, 18);

      const restockLog = overviewB.stockLogs.find((log) => log.reason === 'RESTOCK_SHIPMENT_DHAKA');
      assert.ok(restockLog, 'Timestamped StockAdjustmentLog must persist in Firestore');
      assert.equal(restockLog.previousStock, 10);
      assert.equal(restockLog.newStock, 18);
      assert.equal(restockLog.delta, 8);
      assert.equal(restockLog.actorEmail, 'owner@jerseyvalley.bd');

      assert.equal(overviewB.settings.insideDhakaShippingBdt, 75);
      assert.equal(overviewB.settings.supportPhone, '+880 1711-998877');
      assert.ok(overviewB.coupons.some((c) => c.code === 'EID2026'));

      // Verify Customer Directory endpoint on Instance B
      const customersResB = await fetch(`${urlB}/api/admin/customers`, { headers: adminHeaders });
      assert.equal(customersResB.status, 200);
      const customersBody = (await customersResB.json()) as {
        customers: Array<{
          email: string;
          totalOrders: number;
          orders: Array<{ orderNumber: string; orderAccessToken?: string }>;
        }>;
      };
      const farhanRecord = customersBody.customers.find((c) => c.email === 'customer@example.com');
      assert.ok(farhanRecord, 'Customer directory must aggregate genuine customer orders');
      assert.equal(farhanRecord.totalOrders, 1);
      assert.equal(farhanRecord.orders[0]?.orderAccessToken, undefined, 'Customer directory must strip orderAccessToken');
    });
  } finally {
    if (previousAdminUids === undefined) {
      delete process.env.ADMIN_UIDS;
    } else {
      process.env.ADMIN_UIDS = previousAdminUids;
    }
  }
});

