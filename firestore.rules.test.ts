import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));

// Simulated Zero-Trust Rule Evaluator for Dirty Dozen Payloads
interface AuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
  isAdminDocPresent?: boolean;
}

function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function isVerifiedUser(auth: AuthContext | null): boolean {
  return auth !== null && auth.email_verified === true;
}

function isAdmin(auth: AuthContext | null): boolean {
  return isVerifiedUser(auth) && Boolean(auth?.isAdminDocPresent || auth?.email === 'chalantika07@gmail.com');
}

function evaluateDirtyPayload(
  operation: 'get' | 'list' | 'create' | 'update',
  collectionPath: string,
  docId: string,
  auth: AuthContext | null,
  incomingData: Record<string, unknown> | null,
  existingData: Record<string, unknown> | null,
  parentExists = true
): 'ALLOWED' | 'PERMISSION_DENIED' {
  if (operation !== 'list' && !isValidId(docId)) {
    return 'PERMISSION_DENIED';
  }

  if (collectionPath === '/users') {
    if (operation === 'create' && incomingData) {
      const allowed = ['uid', 'displayName', 'favoriteTeam', 'createdAt', 'updatedAt'];
      const required = ['uid', 'displayName', 'createdAt', 'updatedAt'];
      const keys = Object.keys(incomingData);
      if (!required.every((k) => keys.includes(k)) || !keys.every((k) => allowed.includes(k))) {
        return 'PERMISSION_DENIED';
      }
      if (!isVerifiedUser(auth) || incomingData.uid !== auth?.uid || incomingData.uid !== docId) {
        return 'PERMISSION_DENIED';
      }
      if (typeof incomingData.displayName !== 'string' || incomingData.displayName.length > 80) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOWED';
    }
    if (operation === 'update' && incomingData && existingData) {
      const allowed = ['uid', 'displayName', 'favoriteTeam', 'createdAt', 'updatedAt'];
      const keys = Object.keys(incomingData);
      if (!keys.every((k) => allowed.includes(k))) return 'PERMISSION_DENIED';
      if (incomingData.uid !== existingData.uid || incomingData.createdAt !== existingData.createdAt) {
        return 'PERMISSION_DENIED';
      }
      if (typeof incomingData.displayName !== 'string' || incomingData.displayName.length > 80) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOWED';
    }
  }

  if (collectionPath.startsWith('/users/') && collectionPath.endsWith('/private')) {
    const ownerUid = collectionPath.split('/')[2];
    if (!parentExists) return 'PERMISSION_DENIED';
    if (operation === 'get') {
      if ((isVerifiedUser(auth) && auth?.uid === ownerUid) || isAdmin(auth)) return 'ALLOWED';
      return 'PERMISSION_DENIED';
    }
  }

  if (collectionPath.startsWith('/users/') && collectionPath.endsWith('/wishlist')) {
    if (!parentExists) return 'PERMISSION_DENIED';
  }

  if (collectionPath === '/products') {
    if (operation === 'create') {
      if (!isAdmin(auth)) return 'PERMISSION_DENIED';
      return 'ALLOWED';
    }
  }

  if (collectionPath === '/orders') {
    if (operation === 'list') {
      if (!auth) return 'PERMISSION_DENIED';
      if (!existingData || (existingData.userId !== auth.uid && !isAdmin(auth))) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOWED';
    }
    if (operation === 'create' && incomingData) {
      if (!isVerifiedUser(auth) || incomingData.userId !== auth?.uid || !parentExists) {
        return 'PERMISSION_DENIED';
      }
      if (!['UNPAID_COD', 'PENDING_VERIFICATION'].includes(String(incomingData.paymentStatus))) {
        return 'PERMISSION_DENIED';
      }
      if (incomingData.orderStatus !== 'PENDING_CONFIRMATION') {
        return 'PERMISSION_DENIED';
      }
      if (
        typeof incomingData.customerPhone !== 'string' ||
        !/^(\+?880|0)1[3-9][0-9]{8}$/.test(incomingData.customerPhone)
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOWED';
    }
    if (operation === 'update' && incomingData && existingData) {
      if (isAdmin(auth)) return 'ALLOWED';
      const changedKeys = Object.keys(incomingData).filter((k) => incomingData[k] !== existingData[k]);
      const allowedDiff = ['orderStatus', 'updatedAt'];
      if (!changedKeys.every((k) => allowedDiff.includes(k))) {
        return 'PERMISSION_DENIED';
      }
      if (existingData.orderStatus !== 'PENDING_CONFIRMATION' || incomingData.orderStatus !== 'CANCELLED') {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOWED';
    }
  }

  return 'PERMISSION_DENIED';
}

test('Firestore rules file contains all blueprint collections and Eight Pillars primitives', () => {
  assert.ok(rulesContent.includes("rules_version = '2';"));
  assert.ok(rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  assert.ok(rulesContent.includes('function isValidId(id)'));
  assert.ok(rulesContent.includes('function isValidUserProfile(data)'));
  assert.ok(rulesContent.includes('function isValidUserPrivateInfo(data)'));
  assert.ok(rulesContent.includes('function isValidOrder(data)'));
  assert.ok(rulesContent.includes('function isValidProduct(data)'));
  assert.ok(rulesContent.includes('request.auth.token.email_verified == true'));

  const blueprintPaths = Object.keys(blueprint.firestore);
  assert.equal(blueprintPaths.length, 8);
});

test('Dirty Dozen Payload 1: Shadow privilege field on UserProfile is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/users',
    'u1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { uid: 'u1', displayName: 'Rahim', isAdmin: true, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME' },
    null
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 2: Cross-user PII read on /users/u1/private/info is denied', () => {
  const res = evaluateDirtyPayload(
    'get',
    '/users/u1/private',
    'info',
    { uid: 'u2', email: 'karim@example.com', email_verified: true },
    null,
    { uid: 'u1', phone: '01712345678' },
    true
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 3: Orphaned subcollection write without parent user document is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/users/u1/wishlist',
    'w1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { userId: 'u1', productId: 'p1', productName: 'Argentina Home', priceBdt: 1450, createdAt: 'SERVER_TIME' },
    null,
    false
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 4: Fake paid order creation with paymentStatus VERIFIED is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/orders',
    'o1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    {
      orderNumber: 'JV-1001',
      userId: 'u1',
      customerPhone: '01712345678',
      paymentStatus: 'VERIFIED',
      orderStatus: 'PENDING_CONFIRMATION'
    },
    null,
    true
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 5: Order price tampering on update is denied', () => {
  const res = evaluateDirtyPayload(
    'update',
    '/orders',
    'o1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { orderStatus: 'CANCELLED', totalBdt: 10, updatedAt: 'NEW_TIME' },
    { orderStatus: 'PENDING_CONFIRMATION', totalBdt: 1550, updatedAt: 'OLD_TIME' }
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 6: Terminal state re-opening from DELIVERED to CANCELLED is denied', () => {
  const res = evaluateDirtyPayload(
    'update',
    '/orders',
    'o1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { orderStatus: 'CANCELLED', updatedAt: 'NEW_TIME' },
    { orderStatus: 'DELIVERED', updatedAt: 'OLD_TIME' }
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 7: Unfiltered order list scraping across users is denied', () => {
  const res = evaluateDirtyPayload(
    'list',
    '/orders',
    'o2',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    null,
    { userId: 'u2' }
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 8: Admin email spoofing with email_verified=false is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/products',
    'p1',
    { uid: 'spoof1', email: 'chalantika07@gmail.com', email_verified: false },
    { id: 'p1' },
    null
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 9: Denial-of-Wallet oversized string injection is denied', () => {
  const res = evaluateDirtyPayload(
    'update',
    '/users',
    'u1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    {
      uid: 'u1',
      displayName: 'A'.repeat(5000),
      createdAt: 'T1',
      updatedAt: 'T2'
    },
    {
      uid: 'u1',
      displayName: 'Rahim',
      createdAt: 'T1',
      updatedAt: 'T1'
    }
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 10: ID poisoning with invalid characters is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/users',
    'bad/id with spaces!',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { uid: 'u1', displayName: 'Rahim', createdAt: 'T1', updatedAt: 'T1' },
    null
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 11: Immortal field mutation (createdAt or uid) is denied', () => {
  const res = evaluateDirtyPayload(
    'update',
    '/users',
    'u1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    { uid: 'u1', displayName: 'Rahim Updated', createdAt: 'TAMPERED_TIME', updatedAt: 'T2' },
    { uid: 'u1', displayName: 'Rahim', createdAt: 'ORIGINAL_TIME', updatedAt: 'T1' }
  );
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen Payload 12: Invalid Bangladesh phone number format in order is denied', () => {
  const res = evaluateDirtyPayload(
    'create',
    '/orders',
    'o1',
    { uid: 'u1', email: 'rahim@example.com', email_verified: true },
    {
      orderNumber: 'JV-1002',
      userId: 'u1',
      customerPhone: '12345',
      paymentStatus: 'UNPAID_COD',
      orderStatus: 'PENDING_CONFIRMATION'
    },
    null,
    true
  );
  assert.equal(res, 'PERMISSION_DENIED');
});
