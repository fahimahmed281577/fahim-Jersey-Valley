import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyFirebaseIdToken, checkIsServerAdmin } from './serverAuth';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

function createSignedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signingKeyPem: string
): string {
  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${b64Header}.${b64Payload}`);
  signer.end();
  const signature = signer.sign(signingKeyPem).toString('base64url');
  return `${b64Header}.${b64Payload}.${signature}`;
}

test('verifyFirebaseIdToken accepts valid RS256 signed token with matching projectId', async () => {
  const now = 1760000000;
  const token = createSignedJwt(
    { alg: 'RS256', kid: 'test-key-1', typ: 'JWT' },
    {
      iss: 'https://securetoken.google.com/test-proj',
      aud: 'test-proj',
      sub: 'user-123',
      email: 'customer@example.com',
      email_verified: true,
      iat: now - 60,
      exp: now + 3600
    },
    privateKey
  );

  const verified = await verifyFirebaseIdToken(token, {
    expectedProjectId: 'test-proj',
    publicKeysOverride: { 'test-key-1': publicKey },
    nowSeconds: now
  });

  assert.equal(verified.uid, 'user-123');
  assert.equal(verified.email, 'customer@example.com');
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.isAdminClaim, false);
});

test('verifyFirebaseIdToken rejects expired, wrong-audience, and tampered tokens', async () => {
  const now = 1760000000;

  // 1. Expired token
  const expiredToken = createSignedJwt(
    { alg: 'RS256', kid: 'test-key-1' },
    {
      iss: 'https://securetoken.google.com/test-proj',
      aud: 'test-proj',
      sub: 'user-123',
      iat: now - 7200,
      exp: now - 10
    },
    privateKey
  );

  await assert.rejects(
    () =>
      verifyFirebaseIdToken(expiredToken, {
        expectedProjectId: 'test-proj',
        publicKeysOverride: { 'test-key-1': publicKey },
        nowSeconds: now
      }),
    /expired/i
  );

  // 2. Wrong audience
  const wrongAudToken = createSignedJwt(
    { alg: 'RS256', kid: 'test-key-1' },
    {
      iss: 'https://securetoken.google.com/test-proj',
      aud: 'other-project',
      sub: 'user-123',
      iat: now - 60,
      exp: now + 3600
    },
    privateKey
  );

  await assert.rejects(
    () =>
      verifyFirebaseIdToken(wrongAudToken, {
        expectedProjectId: 'test-proj',
        publicKeysOverride: { 'test-key-1': publicKey },
        nowSeconds: now
      }),
    /audience/i
  );

  // 3. Tampered payload signature mismatch
  const validToken = createSignedJwt(
    { alg: 'RS256', kid: 'test-key-1' },
    {
      iss: 'https://securetoken.google.com/test-proj',
      aud: 'test-proj',
      sub: 'user-123',
      admin: false,
      iat: now - 60,
      exp: now + 3600
    },
    privateKey
  );
  const parts = validToken.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      iss: 'https://securetoken.google.com/test-proj',
      aud: 'test-proj',
      sub: 'user-123',
      admin: true,
      iat: now - 60,
      exp: now + 3600
    })
  ).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  await assert.rejects(
    () =>
      verifyFirebaseIdToken(tamperedToken, {
        expectedProjectId: 'test-proj',
        publicKeysOverride: { 'test-key-1': publicKey },
        nowSeconds: now
      }),
    /signature/i
  );
});

test('checkIsServerAdmin requires emailVerified and checks custom claims or ADMIN_UIDS', async () => {
  process.env.ADMIN_UIDS = 'admin-uid-99';

  // Unverified email is denied even with admin UID
  const unverified = await checkIsServerAdmin({
    uid: 'admin-uid-99',
    email: 'admin@example.com',
    emailVerified: false,
    isAdminClaim: true,
    rawClaims: {}
  });
  assert.equal(unverified, false);

  // Verified email + matching ADMIN_UIDS is allowed
  const validEnvAdmin = await checkIsServerAdmin({
    uid: 'admin-uid-99',
    email: 'admin@example.com',
    emailVerified: true,
    isAdminClaim: false,
    rawClaims: {}
  });
  assert.equal(validEnvAdmin, true);

  // Standard customer is denied
  const regularCustomer = await checkIsServerAdmin({
    uid: 'customer-uid-1',
    email: 'user@example.com',
    emailVerified: true,
    isAdminClaim: false,
    rawClaims: {}
  });
  assert.equal(regularCustomer, false);

  delete process.env.ADMIN_UIDS;
});
