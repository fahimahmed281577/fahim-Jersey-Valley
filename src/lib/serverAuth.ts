import crypto from 'node:crypto';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { getFirebaseAdminFirestoreIfConfigured } from './persistentStore';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

export function loadFirebaseServerConfig(
  env: NodeJS.ProcessEnv = process.env
): FirebaseAppletConfig {
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
      (env.FIREBASE_PROJECT_ID || '').trim() ||
      (env.VITE_FIREBASE_PROJECT_ID || '').trim() ||
      fileConfig.projectId ||
      '',
    firestoreDatabaseId:
      (env.FIREBASE_FIRESTORE_DATABASE_ID || '').trim() ||
      (env.FIREBASE_DATABASE_ID || '').trim() ||
      (env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '').trim() ||
      (env.VITE_FIREBASE_DATABASE_ID || '').trim() ||
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
  const activeConfig = loadFirebaseServerConfig();
  if (rawIdToken && activeConfig.projectId && activeConfig.firestoreDatabaseId) {
    try {
      const dbId = encodeURIComponent(activeConfig.firestoreDatabaseId);
      const uid = encodeURIComponent(user.uid);
      const url = `https://firestore.googleapis.com/v1/projects/${activeConfig.projectId}/databases/${dbId}/documents/admins/${uid}`;
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

export const STANDALONE_ADMIN_COOKIE_NAME = 'jv_admin_session';
export const STANDALONE_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Dummy bcrypt hash (cost 10) used solely to equalize timing when loginId does not match
const TIMING_GUARD_BCRYPT_HASH =
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export interface StandaloneAdminEnvConfig {
  loginId: string;
  passwordHash: string;
  sessionSecret: string;
}

export interface StandaloneAdminConfigStatus {
  configured: boolean;
  missingVars: string[];
  reason?: string;
}

export interface StandaloneAdminSessionPayload {
  sub: string;
  mode: 'standalone_admin';
  jti: string;
  csrf: string;
  iat: number;
  exp: number;
}

// Server-side revocation set & active session store (prevents replay after logout)
const revokedStandaloneSessionIds = new Set<string>();
const activeStandaloneSessions = new Map<string, StandaloneAdminSessionPayload>();

export function getStandaloneAdminConfigStatus(
  env: NodeJS.ProcessEnv = process.env
): StandaloneAdminConfigStatus {
  const loginId = (env.ADMIN_LOGIN_ID || '').trim().replace(/^["']|["']$/g, '');
  const passwordHash = (env.ADMIN_PASSWORD_HASH || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\\$/g, '$');
  const sessionSecret = (env.ADMIN_SESSION_SECRET || '').trim().replace(/^["']|["']$/g, '');

  const missingVars: string[] = [];
  if (!loginId) missingVars.push('ADMIN_LOGIN_ID');
  if (!passwordHash) missingVars.push('ADMIN_PASSWORD_HASH');
  if (!sessionSecret) missingVars.push('ADMIN_SESSION_SECRET');

  if (missingVars.length > 0) {
    return {
      configured: false,
      missingVars,
      reason: `Missing required server environment variables: ${missingVars.join(', ')}. Configure them in .env (local) or Vercel Environment Variables.`
    };
  }

  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) {
    return {
      configured: false,
      missingVars: ['ADMIN_PASSWORD_HASH'],
      reason: 'ADMIN_PASSWORD_HASH must be a valid bcrypt hash (60 characters starting with $2a$, $2b$, or $2y$).'
    };
  }

  if (sessionSecret.length < 32) {
    return {
      configured: false,
      missingVars: ['ADMIN_SESSION_SECRET'],
      reason: 'ADMIN_SESSION_SECRET must be at least 32 characters long for cryptographic session security.'
    };
  }

  return {
    configured: true,
    missingVars: []
  };
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}

/**
 * Verifies standalone admin login credentials against server-only environment variables
 * using timing-safe ID matching and bcrypt password verification.
 */
export async function verifyStandaloneAdminCredentials(
  inputLoginId: string,
  inputPassword: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<{
  ok: boolean;
  statusCode: number;
  adminId?: string;
  error?: string;
}> {
  const configStatus = getStandaloneAdminConfigStatus(env);
  if (!configStatus.configured) {
    return {
      ok: false,
      statusCode: 503,
      error:
        configStatus.reason ||
        'Standalone administrator login is not configured on the server.'
    };
  }

  const trimmedId = String(inputLoginId ?? '').trim();
  const rawPassword = String(inputPassword ?? '');

  if (!trimmedId || !rawPassword || rawPassword.length > 256) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Please enter both your Admin ID and password.'
    };
  }

  const configuredId = (env.ADMIN_LOGIN_ID || '').trim().replace(/^["']|["']$/g, '');
  const configuredHash = (env.ADMIN_PASSWORD_HASH || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\\$/g, '$');

  const idMatches = timingSafeStringMatch(trimmedId, configuredId);
  const hashToCompare = idMatches ? configuredHash : TIMING_GUARD_BCRYPT_HASH;
  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(rawPassword, hashToCompare);
  } catch (err) {
    console.error('Bcrypt comparison caught error:', err);
    return {
      ok: false,
      statusCode: 401,
      error: 'Invalid Admin ID or password.'
    };
  }

  if (!idMatches || !passwordMatches) {
    return {
      ok: false,
      statusCode: 401,
      error: 'Invalid Admin ID or password.'
    };
  }

  return {
    ok: true,
    statusCode: 200,
    adminId: configuredId
  };
}

function signStandalonePayload(
  encodedPayload: string,
  sessionSecret: string
): string {
  return crypto
    .createHmac('sha256', sessionSecret)
    .update(encodedPayload, 'utf8')
    .digest('base64url');
}

/**
 * Creates a signed server-side standalone administrator session token and records it.
 */
export function createStandaloneAdminSession(
  adminId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    nowSeconds?: number;
    ttlSeconds?: number;
  }
): {
  token: string;
  payload: StandaloneAdminSessionPayload;
} {
  const env = options?.env ?? process.env;
  const configStatus = getStandaloneAdminConfigStatus(env);
  if (!configStatus.configured) {
    throw new Error(configStatus.reason || 'Standalone admin session secret is not configured.');
  }

  const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttlSec = options?.ttlSeconds ?? STANDALONE_SESSION_TTL_SECONDS;
  const jti = crypto.randomBytes(18).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');

  const payload: StandaloneAdminSessionPayload = {
    sub: adminId,
    mode: 'standalone_admin',
    jti,
    csrf,
    iat: nowSec,
    exp: nowSec + ttlSec
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const secret = (env.ADMIN_SESSION_SECRET || '').trim().replace(/^["']|["']$/g, '');
  const signature = signStandalonePayload(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;

  activeStandaloneSessions.set(jti, payload);
  return { token, payload };
}

/**
 * Verifies a standalone admin session token's HMAC signature, expiration, and revocation state.
 */
export function verifyStandaloneAdminSessionToken(
  rawToken: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    nowSeconds?: number;
  }
): StandaloneAdminSessionPayload | null {
  const env = options?.env ?? process.env;
  const configStatus = getStandaloneAdminConfigStatus(env);
  if (!configStatus.configured) {
    return null;
  }

  const parts = String(rawToken ?? '').trim().split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) {
    return null;
  }

  const secret = (env.ADMIN_SESSION_SECRET || '').trim().replace(/^["']|["']$/g, '');
  const expectedSig = signStandalonePayload(encodedPayload, secret);
  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as StandaloneAdminSessionPayload;

    if (
      !decoded ||
      decoded.mode !== 'standalone_admin' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.jti !== 'string' ||
      typeof decoded.csrf !== 'string' ||
      typeof decoded.exp !== 'number'
    ) {
      return null;
    }

    const configuredId = (env.ADMIN_LOGIN_ID || '').trim().replace(/^["']|["']$/g, '');
    if (!timingSafeStringMatch(decoded.sub, configuredId)) {
      return null;
    }

    const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (decoded.exp <= nowSec) {
      activeStandaloneSessions.delete(decoded.jti);
      return null;
    }

    if (revokedStandaloneSessionIds.has(decoded.jti)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function parseCookiesHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function extractStandaloneAdminSession(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): {
  session: StandaloneAdminSessionPayload | null;
  rawToken: string | null;
} {
  const cookies = parseCookiesHeader(req.headers.cookie);
  const rawToken = cookies[STANDALONE_ADMIN_COOKIE_NAME] || null;
  if (!rawToken) {
    return { session: null, rawToken: null };
  }

  const session = verifyStandaloneAdminSessionToken(rawToken, { env });
  return { session, rawToken };
}

export function revokeStandaloneAdminSession(
  rawToken: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!rawToken) return;
  const parts = String(rawToken).trim().split('.');
  if (parts.length !== 2) return;
  const [encodedPayload, providedSig] = parts;
  const secret = (env.ADMIN_SESSION_SECRET || '').trim().replace(/^["']|["']$/g, '');
  if (!encodedPayload || !providedSig || !secret) return;

  const expectedSig = signStandalonePayload(encodedPayload, secret);
  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<StandaloneAdminSessionPayload>;
    if (typeof decoded?.jti === 'string' && decoded.jti) {
      revokedStandaloneSessionIds.add(decoded.jti);
      activeStandaloneSessions.delete(decoded.jti);
    }
  } catch {
    // ignore malformed payload
  }
}

export function serializeStandaloneSessionCookie(
  token: string,
  isProduction = process.env.NODE_ENV === 'production'
): string {
  const parts = [
    `${STANDALONE_ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${STANDALONE_SESSION_TTL_SECONDS}`
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function serializeClearStandaloneSessionCookie(
  isProduction = process.env.NODE_ENV === 'production'
): string {
  const parts = [
    `${STANDALONE_ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Validates CSRF protection for state-changing cookie-authenticated requests.
 * Requires either a matching X-CSRF-Token header or X-Requested-With: XMLHttpRequest.
 */
export function verifyStandaloneCsrfRequest(
  req: Request,
  session: StandaloneAdminSessionPayload
): boolean {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const csrfHeader = String(req.headers['x-csrf-token'] ?? '').trim();
  if (csrfHeader && timingSafeStringMatch(csrfHeader, session.csrf)) {
    return true;
  }

  const requestedWith = String(req.headers['x-requested-with'] ?? '').trim();
  if (requestedWith.toLowerCase() === 'xmlhttprequest') {
    return true;
  }

  return false;
}

export interface AuthenticatedAdminActor extends VerifiedFirebaseUser {
  authMode?: 'standalone' | 'firebase';
  adminId?: string;
}

export function createRequireAdminMiddleware(
  verifyFn: TokenVerifierFn = verifyFirebaseIdToken
) {
  return async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // 1. Check for a valid server-side Standalone Admin Session Cookie first
    const { session: standaloneSession } = extractStandaloneAdminSession(req);
    if (standaloneSession) {
      if (!verifyStandaloneCsrfRequest(req, standaloneSession)) {
        res.status(403).json({
          error:
            'CSRF validation failed. Include the X-CSRF-Token or X-Requested-With header on state-changing admin requests.'
        });
        return;
      }

      const standaloneActor: AuthenticatedAdminActor = {
        uid: `standalone:${standaloneSession.sub}`,
        email: `${standaloneSession.sub} (Standalone Admin)`,
        emailVerified: true,
        isAdminClaim: true,
        rawClaims: {
          mode: 'standalone_admin',
          jti: standaloneSession.jti
        },
        authMode: 'standalone',
        adminId: standaloneSession.sub
      };

      (req as Request & { verifiedAdminUser?: AuthenticatedAdminActor }).verifiedAdminUser =
        standaloneActor;
      next();
      return;
    }

    // 2. Fallback to Firebase Bearer Token verification (when Authorization header is present)
    const { user, rawToken, error } = await extractVerifiedUser(req, verifyFn);
    if (!user) {
      res.status(401).json({
        error:
          error ||
          'Administrator authentication required. Sign in with your Standalone Admin ID or a verified Firebase Administrator account.'
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

    const firebaseActor: AuthenticatedAdminActor = {
      ...user,
      authMode: 'firebase'
    };

    (req as Request & { verifiedAdminUser?: AuthenticatedAdminActor }).verifiedAdminUser =
      firebaseActor;
    next();
  };
}

/**
 * Express middleware that strictly requires a verified administrator session
 * (either Standalone Admin Session Cookie or Firebase Admin Bearer Token).
 */
export const requireAdminMiddleware = createRequireAdminMiddleware();


