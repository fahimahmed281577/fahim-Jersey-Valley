import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANGLADESH_DIVISIONS,
  calculateOrderTotals,
  validateBangladeshPhone,
  type PaymentMethod,
  type PaymentStatus,
  type OrderStatus,
  type JerseySize
} from './src/lib/commerce';
import {
  extractVerifiedUser,
  checkIsServerAdmin,
  createRequireAdminMiddleware,
  verifyFirebaseIdToken,
  getStandaloneAdminConfigStatus,
  verifyStandaloneAdminCredentials,
  createStandaloneAdminSession,
  extractStandaloneAdminSession,
  revokeStandaloneAdminSession,
  serializeStandaloneSessionCookie,
  serializeClearStandaloneSessionCookie,
  type AuthenticatedAdminActor,
  type TokenVerifierFn,
  type VerifiedFirebaseUser
} from './src/lib/serverAuth';
import {
  getDefaultPersistenceAdapter,
  StoreError,
  type PersistenceAdapter,
  type StoredOrder
} from './src/lib/persistentStore';

export type { StoredOrder } from './src/lib/persistentStore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeOrderForClient(
  order: StoredOrder
): Omit<StoredOrder, 'orderAccessToken' | 'idempotencyKey'> {
  const { orderAccessToken: _token, idempotencyKey: _idem, ...safeOrder } = order;
  return safeOrder;
}

function resolvePublicBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string'
      ? forwardedProto.split(',')[0].trim()
      : req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

export interface JerseyValleyAppOptions {
  store?: PersistenceAdapter;
  rateLimitMaxRequests?: number;
  loginRateLimitMaxRequests?: number;
  rateLimitWindowMs?: number;
  tokenVerifier?: TokenVerifierFn;
}

export async function createJerseyValleyApp(options?: JerseyValleyAppOptions) {
  const store: PersistenceAdapter = options?.store ?? getDefaultPersistenceAdapter();
  const rateLimitMax = options?.rateLimitMaxRequests ?? 60;
  const loginRateLimitMax = options?.loginRateLimitMaxRequests ?? 6;
  const rateLimitWindowMs = options?.rateLimitWindowMs ?? 60_000;
  const tokenVerifier: TokenVerifierFn = options?.tokenVerifier ?? verifyFirebaseIdToken;
  const requireAdmin = createRequireAdminMiddleware(tokenVerifier);

  const app = express();

  // Support pre-parsed bodies from serverless adapters (Vercel / Lambda)
  app.use((req, _res, next) => {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // ignore JSON parse error
      }
    }
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      (req as express.Request & { _body?: boolean })._body = true;
    }
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  // 0a. CORS, credentials, and preflight OPTIONS handler
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, x-order-access-token, cache-control'
      );
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // 0b. URL prefix normalizer for Vercel/proxied routing
  app.use((req, _res, next) => {
    if (
      !req.url.startsWith('/api') &&
      !req.url.startsWith('/robots.txt') &&
      !req.url.startsWith('/sitemap.xml')
    ) {
      if (
        req.url.startsWith('/admin') ||
        req.url.startsWith('/catalog') ||
        req.url.startsWith('/orders') ||
        req.url.startsWith('/checkout') ||
        req.url.startsWith('/auth')
      ) {
        req.url = `/api${req.url}`;
      }
    }
    next();
  });

  // Sliding-window rate limiter for API mutation & lookup endpoints
  const rateBuckets = new Map<string, number[]>();
  function rateLimitMiddleware(bucketPrefix: string, maxRequests = rateLimitMax) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const forwardedFor = req.headers['x-forwarded-for'];
      const clientIp =
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0].trim()
          : req.ip || '127.0.0.1';
      const key = `${bucketPrefix}:${clientIp}`;
      const now = Date.now();
      const recent = (rateBuckets.get(key) || []).filter((ts) => now - ts < rateLimitWindowMs);
      if (recent.length >= maxRequests) {
        res.status(429).json({
          error: 'Too many requests. Please wait a moment before trying again.'
        });
        return;
      }
      recent.push(now);
      rateBuckets.set(key, recent);
      next();
    };
  }

  // 0. Server-Validated Session & Admin RBAC Verification Endpoint
  app.get('/api/auth/me', async (req, res) => {
    const { user, rawToken, error } = await extractVerifiedUser(req, tokenVerifier);
    if (!user) {
      return res.json({
        authenticated: false,
        uid: null,
        email: null,
        emailVerified: false,
        isAdmin: false,
        persistenceBackend: store.backendType,
        authNotice: error || null
      });
    }

    const isAdmin = await checkIsServerAdmin(user, rawToken || undefined);
    return res.json({
      authenticated: true,
      uid: user.uid,
      email: user.email || null,
      emailVerified: user.emailVerified,
      isAdmin,
      persistenceBackend: store.backendType
    });
  });

  // 1. Public Storefront Catalog & Config API (Backed by shared PersistenceAdapter)
  app.get('/api/catalog', async (_req, res) => {
    try {
      const { products, coupons, settings } = await store.getCatalogAndSettings({
        includeAllCoupons: false
      });
      return res.json({
        products: products.filter((p) => p.isActive),
        coupons,
        settings
      });
    } catch (err) {
      if (err instanceof StoreError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Unable to load storefront catalog.' });
    }
  });

  // 2. Trusted Server-Side Checkout Calculation API
  app.post('/api/checkout/calculate', async (req, res) => {
    try {
      const { items, couponCode, division, district } = req.body ?? {};
      const { products, coupons, settings } = await store.getCatalogAndSettings({
        includeAllCoupons: false
      });
      const result = calculateOrderTotals({
        items: Array.isArray(items) ? items : [],
        catalog: products,
        coupons,
        settings,
        couponCode,
        division,
        district
      });
      return res.json(result);
    } catch (err) {
      if (err instanceof StoreError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Unable to calculate order totals.' });
    }
  });

  // 3. Atomic Server-Side Order Creation API (Concurrency-safe transaction via PersistenceAdapter)
  app.post('/api/orders', rateLimitMiddleware('orders-create'), async (req, res) => {
    const {
      idempotencyKey,
      customerName,
      customerPhone,
      customerEmail,
      division,
      district,
      upazila,
      streetAddress,
      postalCode,
      deliveryNotes,
      paymentMethod,
      couponCode,
      items
    } = req.body ?? {};

    const cleanIdempotencyKey =
      typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (
      cleanIdempotencyKey.length < 8 ||
      cleanIdempotencyKey.length > 128 ||
      !/^[a-zA-Z0-9_\-]+$/.test(cleanIdempotencyKey)
    ) {
      return res.status(400).json({
        error:
          'A valid alphanumeric idempotencyKey (8–128 characters) is required to prevent duplicate orders.'
      });
    }

    const { user: verifiedUser, error: tokenError } = await extractVerifiedUser(req, tokenVerifier);
    if (req.headers.authorization && tokenError) {
      return res.status(401).json({ error: `Invalid authentication token: ${tokenError}` });
    }

    const trimmedName = String(customerName ?? '').trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      return res.status(400).json({ error: 'Please provide your full name (2–80 characters).' });
    }

    const phoneValidation = validateBangladeshPhone(String(customerPhone ?? ''));
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const cleanDivision = String(division ?? '').trim();
    const cleanDistrict = String(district ?? '').trim();
    const cleanUpazila = String(upazila ?? '').trim();
    const cleanStreet = String(streetAddress ?? '').trim();

    if (
      !cleanDivision ||
      !cleanDistrict ||
      !cleanUpazila ||
      cleanStreet.length < 4 ||
      cleanStreet.length > 200
    ) {
      return res.status(400).json({
        error:
          'Complete Bangladesh address (Division, District, Upazila/Thana, and Street Address 4–200 chars) is required.'
      });
    }

    const divisionEntry = BANGLADESH_DIVISIONS[cleanDivision];
    if (!divisionEntry) {
      return res.status(400).json({ error: `Invalid Bangladesh division "${cleanDivision}".` });
    }
    const allowedUpazilas = divisionEntry.districts[cleanDistrict];
    if (!allowedUpazilas) {
      return res.status(400).json({
        error: `District "${cleanDistrict}" does not belong to ${cleanDivision} division.`
      });
    }
    if (!allowedUpazilas.includes(cleanUpazila)) {
      return res.status(400).json({
        error: `Upazila/Thana "${cleanUpazila}" is not listed under ${cleanDistrict} district.`
      });
    }

    const selectedPayment: PaymentMethod =
      paymentMethod === 'BKASH' || paymentMethod === 'NAGAD' ? paymentMethod : 'COD';

    try {
      const { order, duplicatePrevented } = await store.createOrderAtomic({
        idempotencyKey: cleanIdempotencyKey,
        userId: verifiedUser ? verifiedUser.uid : null,
        customerName: trimmedName,
        customerPhone: phoneValidation.normalized,
        customerEmail: String(customerEmail ?? '').trim().slice(0, 120),
        division: cleanDivision,
        district: cleanDistrict,
        upazila: cleanUpazila,
        streetAddress: cleanStreet,
        postalCode: String(postalCode ?? '').trim().slice(0, 10),
        deliveryNotes: String(deliveryNotes ?? '').trim().slice(0, 250),
        paymentMethod: selectedPayment,
        couponCode: typeof couponCode === 'string' ? couponCode : undefined,
        items: Array.isArray(items) ? items : []
      });

      if (duplicatePrevented) {
        return res.status(200).json({
          order: sanitizeOrderForClient(order),
          orderAccessToken: order.orderAccessToken,
          duplicatePrevented: true
        });
      }

      return res.status(201).json({
        order: sanitizeOrderForClient(order),
        orderAccessToken: order.orderAccessToken
      });
    } catch (err) {
      if (err instanceof StoreError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Order creation failed due to a server error.' });
    }
  });

  async function verifyOrderAccess(
    req: express.Request,
    order: StoredOrder
  ): Promise<{
    authorized: boolean;
    reason?: string;
  }> {
    if (order.isDemoOrder) {
      return { authorized: true };
    }

    const tokenParam = String(
      req.query.token ?? req.headers['x-order-access-token'] ?? req.body?.orderAccessToken ?? ''
    ).trim();
    if (tokenParam && tokenParam === order.orderAccessToken) {
      return { authorized: true };
    }

    const rawPhone = String(req.query.phone ?? req.body?.phone ?? '').trim();
    if (rawPhone) {
      const phoneCheck = validateBangladeshPhone(rawPhone);
      if (phoneCheck.valid && phoneCheck.normalized === order.customerPhone) {
        return { authorized: true };
      }
    }

    const { session: standaloneAdminSession } = extractStandaloneAdminSession(req);
    if (standaloneAdminSession) {
      return { authorized: true };
    }

    const { user, rawToken } = await extractVerifiedUser(req, tokenVerifier);
    if (user) {
      if (order.userId && user.uid === order.userId) {
        return { authorized: true };
      }
      const isAdmin = await checkIsServerAdmin(user, rawToken || undefined);
      if (isAdmin) {
        return { authorized: true };
      }
    }

    return {
      authorized: false,
      reason:
        'To protect customer privacy, please provide the 11-digit Bangladesh mobile number used when placing this order (or use the order access token link).'
    };
  }

  // 4. Order Lookup & Tracking API
  app.get('/api/orders/:orderNumber', rateLimitMiddleware('orders-lookup'), async (req, res) => {
    const rawNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    try {
      const found = await store.getOrderByNumber(rawNumber);
      if (!found) {
        return res.status(404).json({ error: `Order ${rawNumber} was not found.` });
      }

      const access = await verifyOrderAccess(req, found);
      if (!access.authorized) {
        return res.status(403).json({
          error: access.reason,
          requiresPhoneVerification: true
        });
      }

      return res.json({ order: sanitizeOrderForClient(found) });
    } catch (err) {
      if (err instanceof StoreError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Unable to retrieve order.' });
    }
  });

  // Customer Order List — strictly requires a verified Firebase Bearer token
  app.get('/api/customer/orders', async (req, res) => {
    const { user, error } = await extractVerifiedUser(req, tokenVerifier);
    if (!user) {
      return res.status(401).json({
        error:
          error ||
          'Authentication required. Sign in with your verified account to view your order history.'
      });
    }

    try {
      const matching = await store.listCustomerOrders(user.uid);
      return res.json({ orders: matching.map(sanitizeOrderForClient) });
    } catch (err) {
      if (err instanceof StoreError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Unable to load customer order history.' });
    }
  });

  // Customer Cancellation of Pending Order
  app.post(
    '/api/orders/:orderNumber/cancel',
    rateLimitMiddleware('orders-cancel'),
    async (req, res) => {
      const rawNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
      try {
        const order = await store.getOrderByNumber(rawNumber);
        if (!order) {
          return res.status(404).json({ error: 'Order not found.' });
        }

        const access = await verifyOrderAccess(req, order);
        if (!access.authorized) {
          return res.status(403).json({
            error: access.reason,
            requiresPhoneVerification: true
          });
        }

        const updated = await store.cancelOrderAtomic(order.orderNumber, 'customer');
        return res.json({ order: sanitizeOrderForClient(updated) });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to cancel order.' });
      }
    }
  );

  // ============================================================================
  // 5. SECURE ADMIN PANEL APIs (Strictly Protected by Server-Side Admin Auth)
  // Supports:
  //   (A) Temporary Standalone Admin Session Cookie (HttpOnly, signed, revocable)
  //   (B) Firebase Admin Bearer Token (verified email + UID in ADMIN_UIDS / claims)
  // Unauthenticated -> 401 | Authenticated Non-Admin -> 403
  // ============================================================================

  // Router-level guard for all /api/admin/* endpoints:
  // Enforces Cache-Control: no-store and requires server-side admin auth on every route
  // except the session check, login, and logout endpoints.
  app.use('/api/admin', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const subPath = req.path.replace(/\/+$/, '') || '/';
    if (
      subPath === '/auth/session' ||
      subPath === '/auth/login' ||
      subPath === '/auth/logout'
    ) {
      next();
      return;
    }
    requireAdmin(req, res, next);
  });

  // 5a. Check Current Admin Session & Standalone Configuration Readiness
  app.get('/api/admin/auth/session', rateLimitMiddleware('admin-session'), async (req, res) => {
    const configStatus = getStandaloneAdminConfigStatus();
    const { session: standaloneSession } = extractStandaloneAdminSession(req);
    if (standaloneSession) {
      return res.json({
        authenticated: true,
        authMode: 'standalone',
        adminId: standaloneSession.sub,
        csrfToken: standaloneSession.csrf,
        expiresAt: new Date(standaloneSession.exp * 1000).toISOString(),
        standaloneConfigured: configStatus.configured,
        missingEnvVars: configStatus.missingVars,
        persistenceBackend: store.backendType
      });
    }

    const { user, rawToken } = await extractVerifiedUser(req, tokenVerifier);
    if (user && user.emailVerified) {
      const isAdmin = await checkIsServerAdmin(user, rawToken || undefined);
      if (isAdmin) {
        return res.json({
          authenticated: true,
          authMode: 'firebase',
          adminId: user.email || user.uid,
          uid: user.uid,
          standaloneConfigured: configStatus.configured,
          missingEnvVars: configStatus.missingVars,
          persistenceBackend: store.backendType
        });
      }
      return res.json({
        authenticated: false,
        authMode: null,
        adminId: null,
        firebaseUserAuthenticated: true,
        isAdmin: false,
        userEmail: user.email || null,
        standaloneConfigured: configStatus.configured,
        missingEnvVars: configStatus.missingVars,
        configNotice: configStatus.configured ? null : configStatus.reason || null,
        persistenceBackend: store.backendType
      });
    }

    return res.json({
      authenticated: false,
      authMode: null,
      adminId: null,
      standaloneConfigured: configStatus.configured,
      missingEnvVars: configStatus.missingVars,
      configNotice: configStatus.configured ? null : configStatus.reason || null,
      persistenceBackend: store.backendType
    });
  });

  // 5b. Standalone Administrator Login Endpoint (Rate-limited, Bcrypt-verified, HttpOnly Cookie)
  app.post(
    '/api/admin/auth/login',
    rateLimitMiddleware('admin-login', loginRateLimitMax),
    async (req, res) => {
      try {
        const requestedWith = String(req.headers['x-requested-with'] ?? '').trim();
        const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
        if (
          requestedWith.toLowerCase() !== 'xmlhttprequest' &&
          !contentType.includes('application/json')
        ) {
          return res.status(403).json({
            error: 'CSRF check failed. Login requests must be sent as JSON with X-Requested-With.'
          });
        }

        let body = req.body;
        if (typeof body === 'string' && body.trim().length > 0) {
          try {
            body = JSON.parse(body);
          } catch {
            body = {};
          }
        }

        const { adminId, password } = (body || {}) as { adminId?: unknown; password?: unknown };
        const verification = await verifyStandaloneAdminCredentials(
          String(adminId ?? ''),
          String(password ?? '')
        );

        if (!verification.ok || !verification.adminId) {
          return res.status(verification.statusCode).json({
            error: verification.error || 'Invalid Admin ID or password.'
          });
        }

        const { token, payload } = createStandaloneAdminSession(verification.adminId);
        res.setHeader('Set-Cookie', serializeStandaloneSessionCookie(token));
        res.setHeader('Cache-Control', 'no-store');

        return res.status(200).json({
          authenticated: true,
          authMode: 'standalone',
          adminId: verification.adminId,
          csrfToken: payload.csrf,
          expiresAt: new Date(payload.exp * 1000).toISOString()
        });
      } catch (err) {
        console.error('Administrator Login Error:', err);
        return res.status(500).json({
          error:
            err instanceof Error
              ? `Server error during administrator login: ${err.message}`
              : 'Server error during administrator login.',
          statusCode: 500
        });
      }
    }
  );

  // 5c. Standalone Administrator Logout Endpoint (Invalidates server session & clears cookie)
  app.post('/api/admin/auth/logout', rateLimitMiddleware('admin-logout'), (req, res) => {
    const { rawToken } = extractStandaloneAdminSession(req);
    revokeStandaloneAdminSession(rawToken);
    res.setHeader('Set-Cookie', serializeClearStandaloneSessionCookie());
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      loggedOut: true,
      authenticated: false
    });
  });

  app.get(
    '/api/admin/overview',
    rateLimitMiddleware('admin-read'),
    requireAdmin,
    async (req, res) => {
      try {
        const adminActor = (
          req as express.Request & { verifiedAdminUser?: AuthenticatedAdminActor }
        ).verifiedAdminUser;
        const { session: standaloneSession } = extractStandaloneAdminSession(req);
        const [
          { products, coupons, settings },
          allOrders,
          stockLogs,
          customers
        ] = await Promise.all([
          store.getCatalogAndSettings({ includeAllCoupons: true }),
          store.listAllOrders(),
          store.listStockAdjustmentLogs(60),
          store.listCustomerDirectory()
        ]);

        // Genuine customer orders strictly exclude demonstration orders (isDemoOrder: true)
        const realOrders = allOrders.filter((o) => !o.isDemoOrder);
        const demoOrders = allOrders.filter((o) => o.isDemoOrder);
        const activeRealOrders = realOrders.filter((o) => o.orderStatus !== 'CANCELLED');

        const pendingOrdersCount = realOrders.filter(
          (o) => o.orderStatus === 'PENDING_CONFIRMATION'
        ).length;
        const confirmedOrdersCount = realOrders.filter(
          (o) => o.orderStatus === 'CONFIRMED' || o.orderStatus === 'PROCESSING'
        ).length;
        const shippedOrdersCount = realOrders.filter(
          (o) => o.orderStatus === 'SHIPPED'
        ).length;
        const deliveredOrdersCount = realOrders.filter(
          (o) => o.orderStatus === 'DELIVERED'
        ).length;
        const cancelledOrdersCount = realOrders.filter(
          (o) => o.orderStatus === 'CANCELLED'
        ).length;

        const totalRevenueBookedBdt = activeRealOrders.reduce(
          (acc, o) => acc + o.totalBdt,
          0
        );
        const verifiedPaidRevenueBdt = realOrders
          .filter((o) => o.orderStatus !== 'CANCELLED' && o.paymentStatus === 'VERIFIED')
          .reduce((acc, o) => acc + o.totalBdt, 0);
        const totalSalesCompletedBdt = realOrders
          .filter(
            (o) =>
              o.orderStatus !== 'CANCELLED' &&
              (o.orderStatus === 'DELIVERED' || o.paymentStatus === 'VERIFIED')
          )
          .reduce((acc, o) => acc + o.totalBdt, 0);
        const pendingCodBdt = activeRealOrders
          .filter((o) => o.paymentStatus === 'UNPAID_COD')
          .reduce((acc, o) => acc + o.totalBdt, 0);

        const activeProductsCount = products.filter((p) => p.isActive).length;
        const archivedProductsCount = products.filter((p) => !p.isActive).length;

        const lowStockItems: Array<{
          productId: string;
          productName: string;
          team: string;
          slug: string;
          size: JerseySize;
          sku: string;
          stock: number;
        }> = [];

        for (const prod of products) {
          if (!prod.isActive) continue;
          for (const variant of prod.variants) {
            if (variant.isActive && variant.stock <= 5) {
              lowStockItems.push({
                productId: prod.id,
                productName: prod.name,
                team: prod.team,
                slug: prod.slug,
                size: variant.size,
                sku: variant.sku,
                stock: variant.stock
              });
            }
          }
        }
        lowStockItems.sort((a, b) => a.stock - b.stock);

        const totalStockUnits = products.reduce(
          (acc, p) => acc + p.variants.reduce((vAcc, v) => vAcc + v.stock, 0),
          0
        );

        const sanitizedOrders = allOrders.map(sanitizeOrderForClient);

        return res.json({
          authorizedAdmin: true,
          persistenceBackend: store.backendType,
          adminSession: {
            authMode: adminActor?.authMode || 'standalone',
            adminId: adminActor?.adminId || adminActor?.email || 'jvadmin',
            uid: adminActor?.uid || 'standalone:jvadmin',
            csrfToken: standaloneSession?.csrf || null
          },
          metrics: {
            totalOrders: realOrders.length,
            pendingOrdersCount,
            confirmedOrdersCount,
            shippedOrdersCount,
            deliveredOrdersCount,
            cancelledOrdersCount,
            demoOrdersCount: demoOrders.length,
            activeOrdersCount: activeRealOrders.length,
            totalSalesCompletedBdt,
            totalRevenueBookedBdt,
            verifiedPaidRevenueBdt,
            pendingCodBdt,
            totalProducts: products.length,
            activeProductsCount,
            archivedProductsCount,
            lowStockVariantsCount: lowStockItems.length,
            totalStockUnits
          },
          lowStockItems,
          recentOrders: sanitizedOrders.slice(0, 8),
          orders: sanitizedOrders,
          products,
          coupons,
          stockLogs,
          customers,
          settings
        });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to load admin overview.' });
      }
    }
  );

  // Admin Customer Directory & Order History API
  app.get(
    '/api/admin/customers',
    rateLimitMiddleware('admin-read'),
    requireAdmin,
    async (_req, res) => {
      try {
        const customers = await store.listCustomerDirectory();
        return res.json({ customers });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to load customer directory.' });
      }
    }
  );

  // Admin Create Product API
  app.post(
    '/api/admin/products',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      try {
        const product = await store.createProductAtomic(req.body ?? {});
        return res.status(201).json({ product });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to create product.' });
      }
    }
  );

  // Admin Edit Product API
  app.put(
    '/api/admin/products/:productId',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const productId = String(req.params.productId ?? '').trim();
      try {
        const product = await store.updateProductAtomic(productId, req.body ?? {});
        return res.json({ product });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to update product.' });
      }
    }
  );

  // Admin Archive / Restore Product API
  app.patch(
    '/api/admin/products/:productId/archive',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const productId = String(req.params.productId ?? '').trim();
      const { isActive } = req.body ?? {};
      try {
        const product = await store.setProductArchiveStateAtomic(
          productId,
          Boolean(isActive)
        );
        return res.json({ product });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to archive/restore product.' });
      }
    }
  );

  // Admin Order Status & Payment Status Update API
  app.patch(
    '/api/admin/orders/:orderNumber',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const orderNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
      const { orderStatus, paymentStatus, note } = req.body ?? {};
      try {
        const existing = await store.getOrderByNumber(orderNumber);
        if (!existing) {
          return res.status(404).json({ error: 'Order not found.' });
        }

        const nextOrderStatus: OrderStatus = orderStatus ?? existing.orderStatus;
        const nextPaymentStatus: PaymentStatus = paymentStatus ?? existing.paymentStatus;

        const updated = await store.updateOrderStatusAtomic({
          orderNumber: existing.orderNumber,
          nextOrderStatus,
          nextPaymentStatus,
          note: typeof note === 'string' ? note : undefined
        });

        return res.json({ order: sanitizeOrderForClient(updated) });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to update order status.' });
      }
    }
  );

  // Admin Variant Stock & Price Adjustment API (Records timestamped StockAdjustmentLog)
  app.patch(
    '/api/admin/products/:productId/stock',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const productId = String(req.params.productId ?? '').trim();
      const { size, stock, priceBdt, reason } = req.body ?? {};
      const adminUser = (
        req as express.Request & { verifiedAdminUser?: VerifiedFirebaseUser }
      ).verifiedAdminUser;
      try {
        const product = await store.updateVariantStockAtomic({
          productId,
          size: size as JerseySize,
          stock,
          priceBdt,
          reason: typeof reason === 'string' ? reason : undefined,
          actorUid: adminUser?.uid || 'admin',
          actorEmail: adminUser?.email || 'admin'
        });
        return res.json({ product });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to update variant stock.' });
      }
    }
  );

  // Admin Store Settings Update API
  app.patch(
    '/api/admin/settings',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const {
        announcementText,
        insideDhakaShippingBdt,
        outsideDhakaShippingBdt,
        freeShippingThresholdBdt,
        returnWindowDays,
        supportPhone,
        supportEmail,
        storeAddress
      } = req.body ?? {};

      try {
        const settings = await store.updateSiteSettingsAtomic({
          announcementText,
          insideDhakaShippingBdt,
          outsideDhakaShippingBdt,
          freeShippingThresholdBdt,
          returnWindowDays,
          supportPhone,
          supportEmail,
          storeAddress
        });
        return res.json({ settings });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to update site settings.' });
      }
    }
  );

  // Admin Coupon Create / Update API
  app.post(
    '/api/admin/coupons',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      try {
        const coupon = await store.upsertCouponAtomic(req.body ?? {});
        return res.status(201).json({ coupon });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to save coupon.' });
      }
    }
  );

  // Admin Coupon Deactivate / Delete API
  app.delete(
    '/api/admin/coupons/:code',
    rateLimitMiddleware('admin-write'),
    requireAdmin,
    async (req, res) => {
      const code = String(req.params.code ?? '').trim().toUpperCase();
      try {
        await store.deleteCouponAtomic(code);
        return res.json({ deleted: true, code });
      } catch (err) {
        if (err instanceof StoreError) {
          return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Unable to delete coupon.' });
      }
    }
  );

  // 6. SEO Endpoints: robots.txt and sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    let productUrls = '';
    try {
      const { products } = await store.getCatalogAndSettings();
      productUrls = products
        .filter((p) => p.isActive)
        .map(
          (p) =>
            `  <url>\n    <loc>${baseUrl}/product/${p.slug}</loc>\n    <lastmod>${p.updatedAt.split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
        )
        .join('\n');
    } catch {
      // If production persistence is unconfigured, still serve core route sitemap entries
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/shop</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/track</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>${productUrls ? `\n${productUrls}` : ''}
</urlset>`;
    res.type('application/xml').send(xml);
  });

  // 404 handler for unmatched /api/* endpoints (guarantee JSON, never HTML)
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: 'API endpoint not found.',
      statusCode: 404
    });
  });

  // Global JSON error handler
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('API Error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'An internal server error occurred.',
          statusCode: 500
        });
      }
    }
  );

  return app;
}

async function startServer() {
  const app = await createJerseyValleyApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Jersey Valley server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
