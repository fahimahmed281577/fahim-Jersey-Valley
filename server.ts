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
  requireAdminMiddleware
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
  rateLimitWindowMs?: number;
}

export async function createJerseyValleyApp(options?: JerseyValleyAppOptions) {
  const store: PersistenceAdapter = options?.store ?? getDefaultPersistenceAdapter();
  const rateLimitMax = options?.rateLimitMaxRequests ?? 60;
  const rateLimitWindowMs = options?.rateLimitWindowMs ?? 60_000;

  const app = express();
  app.use(express.json({ limit: '256kb' }));

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
    const { user, rawToken, error } = await extractVerifiedUser(req);
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
      const { products, coupons, settings } = await store.getCatalogAndSettings();
      return res.json({ products, coupons, settings });
    } catch {
      return res.status(500).json({ error: 'Unable to load storefront catalog.' });
    }
  });

  // 2. Trusted Server-Side Checkout Calculation API
  app.post('/api/checkout/calculate', async (req, res) => {
    try {
      const { items, couponCode, division, district } = req.body ?? {};
      const { products, coupons, settings } = await store.getCatalogAndSettings();
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
    } catch {
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

    // Mandatory idempotency key validation
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

    // Verify optional customer authentication token (never trust raw userId in body)
    const { user: verifiedUser, error: tokenError } = await extractVerifiedUser(req);
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

    // Server-side validation of Division -> District -> Upazila hierarchy
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

  // Helper to verify whether a requester is authorized to view or cancel a specific order
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

    // 1. Check per-order receipt token
    const tokenParam = String(
      req.query.token ?? req.headers['x-order-access-token'] ?? req.body?.orderAccessToken ?? ''
    ).trim();
    if (tokenParam && tokenParam === order.orderAccessToken) {
      return { authorized: true };
    }

    // 2. Check matching normalized Bangladesh phone number
    const rawPhone = String(req.query.phone ?? req.body?.phone ?? '').trim();
    if (rawPhone) {
      const phoneCheck = validateBangladeshPhone(rawPhone);
      if (phoneCheck.valid && phoneCheck.normalized === order.customerPhone) {
        return { authorized: true };
      }
    }

    // 3. Check verified Firebase user (order owner or server admin)
    const { user, rawToken } = await extractVerifiedUser(req);
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
        'To protect customer privacy, please provide the 11-digit Bangladesh mobile number used when placing this order (or sign in to the customer account that placed it).'
    };
  }

  // 4. Order Lookup & Tracking API (Protected against unauthenticated PII enumeration)
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
    } catch {
      return res.status(500).json({ error: 'Unable to retrieve order.' });
    }
  });

  // Customer Order List — strictly requires a verified Firebase Bearer token
  app.get('/api/customer/orders', async (req, res) => {
    const { user, error } = await extractVerifiedUser(req);
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
    } catch {
      return res.status(500).json({ error: 'Unable to load customer order history.' });
    }
  });

  // Customer Cancellation of Pending Order (Requires ownership verification + atomic stock restoration)
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

  // 5. Admin Overview & Management APIs (Protected by Server-Validated Admin RBAC)
  app.get('/api/admin/overview', async (req, res) => {
    const { user, rawToken } = await extractVerifiedUser(req);
    const isAdmin = user ? await checkIsServerAdmin(user, rawToken || undefined) : false;
    const allowReadonlyPreview = req.query.mode === 'readonly_audit';

    if (!isAdmin && !allowReadonlyPreview) {
      return res.status(user ? 403 : 401).json({
        error:
          'Administrator authorization required. Sign in with an account listed in /admins/{uid}, ADMIN_UIDS, or carrying a verified admin custom claim.'
      });
    }

    try {
      const [{ products, coupons, settings }, allOrders] = await Promise.all([
        store.getCatalogAndSettings(),
        store.listAllOrders()
      ]);

      // Real orders vs sample demonstration orders are strictly separated in financial metrics
      const realOrders = allOrders.filter((o) => !o.isDemoOrder);
      const demoOrders = allOrders.filter((o) => o.isDemoOrder);
      const activeRealOrders = realOrders.filter((o) => o.orderStatus !== 'CANCELLED');

      const totalRevenueBookedBdt = activeRealOrders.reduce((acc, o) => acc + o.totalBdt, 0);
      const verifiedPaidRevenueBdt = realOrders
        .filter((o) => o.paymentStatus === 'VERIFIED')
        .reduce((acc, o) => acc + o.totalBdt, 0);
      const pendingCodBdt = activeRealOrders
        .filter((o) => o.paymentStatus === 'UNPAID_COD')
        .reduce((acc, o) => acc + o.totalBdt, 0);

      const totalStockUnits = products.reduce(
        (acc, p) => acc + p.variants.reduce((vAcc, v) => vAcc + v.stock, 0),
        0
      );

      // Non-admin read-only preview never receives real customer orders or customer PII
      const visibleOrders = isAdmin
        ? allOrders.map(sanitizeOrderForClient)
        : demoOrders.map(sanitizeOrderForClient);

      return res.json({
        authorizedAdmin: isAdmin,
        persistenceBackend: store.backendType,
        metrics: {
          totalOrders: realOrders.length,
          demoOrdersCount: demoOrders.length,
          activeOrdersCount: activeRealOrders.length,
          totalRevenueBookedBdt,
          verifiedPaidRevenueBdt,
          pendingCodBdt,
          totalProducts: products.length,
          totalStockUnits
        },
        orders: visibleOrders,
        products,
        coupons,
        settings
      });
    } catch {
      return res.status(500).json({ error: 'Unable to load admin overview.' });
    }
  });

  app.patch(
    '/api/admin/orders/:orderNumber',
    rateLimitMiddleware('admin-write'),
    requireAdminMiddleware,
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

  app.patch(
    '/api/admin/products/:productId/stock',
    rateLimitMiddleware('admin-write'),
    requireAdminMiddleware,
    async (req, res) => {
      const productId = String(req.params.productId ?? '').trim();
      const { size, stock, priceBdt } = req.body ?? {};
      try {
        const product = await store.updateVariantStockAtomic({
          productId,
          size: size as JerseySize,
          stock,
          priceBdt
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

  app.patch(
    '/api/admin/settings',
    rateLimitMiddleware('admin-write'),
    requireAdminMiddleware,
    async (req, res) => {
      const {
        announcementText,
        insideDhakaShippingBdt,
        outsideDhakaShippingBdt,
        freeShippingThresholdBdt
      } = req.body ?? {};

      try {
        const settings = await store.updateSiteSettingsAtomic({
          announcementText,
          insideDhakaShippingBdt,
          outsideDhakaShippingBdt,
          freeShippingThresholdBdt
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

  // 6. SEO Endpoints: robots.txt and sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const { products } = await store.getCatalogAndSettings();
    const productUrls = products
      .filter((p) => p.isActive)
      .map(
        (p) =>
          `  <url>\n    <loc>${baseUrl}/product/${p.slug}</loc>\n    <lastmod>${p.updatedAt.split('T')[0]}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
      )
      .join('\n');

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
  </url>
${productUrls}
</urlset>`;
    res.type('application/xml').send(xml);
  });

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
