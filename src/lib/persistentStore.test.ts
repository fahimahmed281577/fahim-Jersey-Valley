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
      }) => Promise<T>
    ): Promise<T> {
      const next = txChain.then(async () => {
        const stagedWrites: Array<{ colName: string; docId: string; data: Record<string, unknown> }> = [];
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
            stagedWrites.push({
              colName: docRef._colName,
              docId: docRef._docId,
              data: structuredClone(data)
            });
          }
        };
        const result = await updateFn(tx);
        for (const write of stagedWrites) {
          getCollectionMap(write.colName).set(write.docId, write.data);
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
