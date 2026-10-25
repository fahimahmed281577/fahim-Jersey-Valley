import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAdminFirestoreIfConfigured } from './persistentStore';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseServerConfig(): FirebaseAppletConfig {
  let fileConfig: Partial<FirebaseAppletConfig> = {};
  try {
    const raw = fs.readFileSync(
      new URL('../../firebase-applet-config.json', import.meta.url),
      'utf-8'
    );
    fileConfig = JSON.parse(raw) as Partial<FirebaseAppletConfig>;
  } catch {
    // Fallback to environment variables if file is unavailable
  }

  return {
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      fileConfig.projectId ||
      '',
    firestoreDatabaseId:
      process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      fileConfig.firestoreDatabaseId ||
      '(default)'
  };
}

const serverFirebaseConfig = loadFirebaseServerConfig();

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  isAdminClaim: boolean;
  rawClaims: Record<string, unknown>;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> | null = null;
let cachedCertsExpiresAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCertsExpiresAt) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google SecureToken public keys (${res.status})`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  const certs = (await res.json()) as Record<string, string>;
  cachedCerts = certs;
  cachedCertsExpiresAt = now + maxAgeSeconds * 1000;
  return certs;
}

function base64UrlDecodeToBuffer(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

/**
 * Cryptographically verifies a Firebase ID token (RS256 JWT) against Google's public keys
 * (or injected public keys for deterministic unit testing).
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  options?: {
    expectedProjectId?: string;
    publicKeysOverride?: Record<string, string>;
    nowSeconds?: number;
  }
): Promise<VerifiedFirebaseUser> {
  const projectId = options?.expectedProjectId || serverFirebaseConfig.projectId;
  if (!projectId) {
    throw new Error('Firebase projectId is not configured on the server.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected 3 segments.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: JwtHeader;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecodeToBuffer(encodedHeader).toString('utf-8')) as JwtHeader;
    payload = JSON.parse(
      base64UrlDecodeToBuffer(encodedPayload).toString('utf-8')
    ) as Record<string, unknown>;
  } catch {
    throw new Error('Malformed JWT: invalid JSON in header or payload.');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported JWT algorithm "${header.alg}". Expected RS256.`);
  }
  if (!header.kid) {
    throw new Error('Missing "kid" in JWT header.');
  }

  const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;

  if (exp <= nowSec) {
    throw new Error('Firebase ID token has expired.');
  }
  if (iat > nowSec + 300) {
    throw new Error('Firebase ID token issued in the future.');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid token issuer "${String(payload.iss)}".`);
  }

  if (payload.aud !== projectId) {
    throw new Error(`Invalid token audience "${String(payload.aud)}".`);
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub || sub.length > 128) {
    throw new Error('Invalid token subject (uid).');
  }

  const certs = options?.publicKeysOverride ?? (await getGooglePublicCerts());
  const certOrKey = certs[header.kid];
  if (!certOrKey) {
    throw new Error(`Unknown signing key ID "${header.kid}".`);
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const signatureBuffer = base64UrlDecodeToBuffer(encodedSignature);
  const isSignatureValid = verifier.verify(certOrKey, signatureBuffer);
  if (!isSignatureValid) {
    throw new Error('Invalid JWT cryptographic signature.');
  }

  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const emailVerified = payload.email_verified === true;
  const isAdminClaim = payload.admin === true || payload.role === 'admin';

  return {
    uid: sub,
    email,
    emailVerified,
    isAdminClaim,
    rawClaims: payload
  };
}

/**
 * Checks whether a verified Firebase user has administrator privileges on the server.
 * Admin access is granted ONLY if:
 * 1. The user has emailVerified === true, AND
 * 2. Either:
 *    a) The token contains a trusted custom claim (`admin: true` or `role: "admin"`), OR
 *    b) The user's UID is explicitly listed in the server-side `ADMIN_UIDS` env variable, OR
 *    c) A document `/admins/{uid}` exists in the Firestore database (checked via Admin SDK or REST API).
 */
export async function checkIsServerAdmin(
  user: VerifiedFirebaseUser,
  rawIdToken?: string
): Promise<boolean> {
  if (!user.emailVerified) {
    return false;
  }

  if (user.isAdminClaim) {
    return true;
  }

  const configuredAdminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (configuredAdminUids.includes(user.uid)) {
    return true;
  }

  // Prefer Firebase Admin SDK lookup on /admins/{uid} when configured
  const adminDb = getFirebaseAdminFirestoreIfConfigured();
  if (adminDb) {
    try {
      const adminSnap = await adminDb.collection('admins').doc(user.uid).get();
      if (adminSnap.exists) {
        return true;
      }
    } catch {
      // Fallback to REST check below
    }
  }

  // Check Firestore /admins/{uid} document using the user's verified ID token
  if (rawIdToken && serverFirebaseConfig.projectId && serverFirebaseConfig.firestoreDatabaseId) {
    try {
      const dbId = encodeURIComponent(serverFirebaseConfig.firestoreDatabaseId);
      const uid = encodeURIComponent(user.uid);
      const url = `https://firestore.googleapis.com/v1/projects/${serverFirebaseConfig.projectId}/databases/${dbId}/documents/admins/${uid}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${rawIdToken}`
        }
      });
      if (res.status === 200) {
        return true;
      }
    } catch {
      // Fallback to false if Firestore lookup fails
    }
  }

  return false;
}

export type TokenVerifierFn = (rawToken: string) => Promise<VerifiedFirebaseUser>;

/**
 * Extracts and verifies a Bearer token from an Express request if present.
 */
export async function extractVerifiedUser(
  req: Request,
  verifyFn: TokenVerifierFn = verifyFirebaseIdToken
): Promise<{
  user: VerifiedFirebaseUser | null;
  rawToken: string | null;
  error?: string;
}> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, rawToken: null };
  }

  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    return { user: null, rawToken: null };
  }

  try {
    const user = await verifyFn(rawToken);
    return { user, rawToken };
  } catch (err) {
    return {
      user: null,
      rawToken: null,
      error: err instanceof Error ? err.message : 'Invalid authentication token.'
    };
  }
}

export function createRequireAdminMiddleware(
  verifyFn: TokenVerifierFn = verifyFirebaseIdToken
) {
  return async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const { user, rawToken, error } = await extractVerifiedUser(req, verifyFn);
    if (!user) {
      res.status(401).json({
        error:
          error ||
          'Authentication required. Provide a valid Firebase ID token in the Authorization Bearer header.'
      });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error:
          'Administrator access requires a verified email address (email_verified: true).'
      });
      return;
    }

    const isAdmin = await checkIsServerAdmin(user, rawToken || undefined);
    if (!isAdmin) {
      res.status(403).json({
        error:
          'Administrator privileges required. Your account does not have an /admins/{uid} record, ADMIN_UIDS entry, or admin custom claim.'
      });
      return;
    }

    (req as Request & { verifiedAdminUser?: VerifiedFirebaseUser }).verifiedAdminUser = user;
    next();
  };
}

/**
 * Express middleware that strictly requires a verified administrator session.
 */
export const requireAdminMiddleware = createRequireAdminMiddleware();

