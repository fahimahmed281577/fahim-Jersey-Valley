import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  BANGLADESH_DIVISIONS,
  calculateOrderTotals,
  validateBangladeshPhone,
  validateOrderStateTransition,
  type Product,
  type CouponDefinition,
  type SiteSettingsConfig,
  type PricedOrderItem,
  type PaymentMethod,
  type PaymentStatus,
  type OrderStatus,
  type JerseySize
} from './src/lib/commerce.ts';
import {
  INITIAL_CATALOG,
  INITIAL_COUPONS,
  INITIAL_SITE_SETTINGS
} from './src/data/catalog.ts';
import {
  extractVerifiedUser,
  checkIsServerAdmin,
  requireAdminMiddleware
} from './src/lib/serverAuth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredOrder {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  orderAccessToken: string;
  isDemoOrder: boolean;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress: string;
  postalCode: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  items: PricedOrderItem[];
  itemCount: number;
  subtotalBdt: number;
  customizationTotalBdt: number;
  discountBdt: number;
  appliedCouponCode: string | null;
  shippingBdt: number;
  shippingZoneLabel: string;
  totalBdt: number;
  createdAt: string;
  updatedAt: string;
  statusHistory: {
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    timestamp: string;
    note: string;
  }[];
}

// Authoritative server-side state initialized with demonstration catalog and 1 explicitly labeled demo order
const catalogStore: Product[] = structuredClone(INITIAL_CATALOG);
const couponsStore: CouponDefinition[] = structuredClone(INITIAL_COUPONS);
let siteSettingsStore: SiteSettingsConfig = structuredClone(INITIAL_SITE_SETTINGS);

const inFlightIdempotencyKeys = new Set<string>();

const ordersStore: StoredOrder[] = [
  {
    id: 'ord-demo-0001',
    orderNumber: 'JV-DEMO-0001',
    idempotencyKey: 'seed-order-demo-0001',
    orderAccessToken: 'demo-public-token-0001',
    isDemoOrder: true,
    userId: null,
    customerName: 'Sample Customer (Demonstration Record)',
    customerPhone: '01700000000',
    customerEmail: 'sample.order@example.invalid',
    division: 'Dhaka',
    district: 'Dhaka',
    upazila: 'Dhanmondi',
    streetAddress: 'Sample Address — Demonstration Order Only (Not a Real Customer)',
    postalCode: '1209',
    deliveryNotes: 'Demonstration order seeded for order-tracking walkthrough.',
    paymentMethod: 'COD',
    paymentStatus: 'UNPAID_COD',
    orderStatus: 'CONFIRMED',
    items: [
      {
        productId: 'arg-home-2026',
        slug: 'argentina-2026-home-fan-replica',
        productName: 'Argentina 2026 Home Fan Replica Jersey',
        team: 'Argentina',
        editionTier: 'Fan Replica',
        size: 'L',
        sku: 'JV-ARG26-L',
        quantity: 1,
        baseUnitPriceBdt: 1350,
        customName: 'MESSI',
        customNumber: '10',
        hasCustomPrint: true,
        customPrintUnitFeeBdt: 350,
        finalUnitPriceBdt: 1700,
        lineTotalBdt: 1700
      }
    ],
    itemCount: 1,
    subtotalBdt: 1700,
    customizationTotalBdt: 350,
    discountBdt: 170,
    appliedCouponCode: 'VALLEY10',
    shippingBdt: 70,
    shippingZoneLabel: 'Inside Dhaka Metro (24–48h Dispatch)',
    totalBdt: 1600,
    createdAt: '2026-10-24T16:30:00.000Z',
    updatedAt: '2026-10-24T17:10:00.000Z',
    statusHistory: [
      {
        status: 'PENDING_CONFIRMATION',
        paymentStatus: 'UNPAID_COD',
        timestamp: '2026-10-24T16:30:00.000Z',
        note: 'Demonstration order seeded via Cash on Delivery (Excluded from real revenue metrics).'
      },
      {
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID_COD',
        timestamp: '2026-10-24T17:10:00.000Z',
        note: 'Sample dispatch confirmation for demonstration walkthrough.'
      }
    ]
  }
];

function sanitizeOrderForClient(order: StoredOrder): Omit<StoredOrder, 'orderAccessToken' | 'idempotencyKey'> {
  const { orderAccessToken: _token, idempotencyKey: _idem, ...safeOrder } = order;
  return safeOrder;
}

export async function createJerseyValleyApp() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

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
        authNotice: error || null
      });
    }

    const isAdmin = await checkIsServerAdmin(user, rawToken || undefined);
    return res.json({
      authenticated: true,
      uid: user.uid,
      email: user.email || null,
      emailVerified: user.emailVerified,
      isAdmin
    });
  });

  // 1. Public Storefront Catalog & Config API
  app.get('/api/catalog', (_req, res) => {
    res.json({
      products: catalogStore,
      coupons: couponsStore.filter((c) => c.isActive),
      settings: siteSettingsStore
    });
  });

  // 2. Trusted Server-Side Checkout Calculation API
  app.post('/api/checkout/calculate', (req, res) => {
    const { items, couponCode, division, district } = req.body ?? {};
    const result = calculateOrderTotals({
      items: Array.isArray(items) ? items : [],
      catalog: catalogStore,
      coupons: couponsStore,
      settings: siteSettingsStore,
      couponCode,
      division,
      district
    });
    res.json(result);
  });

  // 3. Atomic Server-Side Order Creation API (COD + Modular Payment Gateway Guard)
  app.post('/api/orders', async (req, res) => {
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
    if (cleanIdempotencyKey.length < 8 || cleanIdempotencyKey.length > 128) {
      return res.status(400).json({
        error: 'A valid idempotencyKey (8–128 characters) is required to prevent duplicate orders.'
      });
    }

    // Check completed orders for idempotent replay
    const existingOrder = ordersStore.find((o) => o.idempotencyKey === cleanIdempotencyKey);
    if (existingOrder) {
      return res.status(200).json({
        order: sanitizeOrderForClient(existingOrder),
        orderAccessToken: existingOrder.orderAccessToken,
        duplicatePrevented: true
      });
    }

    // Prevent concurrent in-flight duplicate submissions
    if (inFlightIdempotencyKeys.has(cleanIdempotencyKey)) {
      return res.status(409).json({
        error: 'This order request is already being processed. Please wait.'
      });
    }

    inFlightIdempotencyKeys.add(cleanIdempotencyKey);

    try {
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

      if (!cleanDivision || !cleanDistrict || !cleanUpazila || cleanStreet.length < 4 || cleanStreet.length > 200) {
        return res.status(400).json({
          error: 'Complete Bangladesh address (Division, District, Upazila/Thana, and Street Address 4–200 chars) is required.'
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

      // Never simulate fake online payment verification in production
      if (selectedPayment === 'BKASH' && !siteSettingsStore.bkashMerchantEnabled) {
        return res.status(400).json({
          error:
            'bKash Tokenized Checkout merchant credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        });
      }
      if (selectedPayment === 'NAGAD' && !siteSettingsStore.nagadMerchantEnabled) {
        return res.status(400).json({
          error:
            'Nagad Merchant PGW credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        });
      }

      const calculation = calculateOrderTotals({
        items: Array.isArray(items) ? items : [],
        catalog: catalogStore,
        coupons: couponsStore,
        settings: siteSettingsStore,
        couponCode,
        division: cleanDivision,
        district: cleanDistrict
      });

      if (!calculation.valid) {
        return res.status(400).json({ error: calculation.error ?? 'Order calculation failed.' });
      }

      // Two-phase atomic check-then-deduct to guarantee no partial stock deduction
      for (const pricedItem of calculation.items) {
        const product = catalogStore.find((p) => p.id === pricedItem.productId);
        const variant = product?.variants.find((v) => v.size === pricedItem.size && v.isActive);
        if (!product || !variant || variant.stock < pricedItem.quantity) {
          return res.status(409).json({
            error: `Stock changed for ${pricedItem.productName} (${pricedItem.size}). Available: ${variant?.stock ?? 0}.`
          });
        }
      }

      const nowIso = new Date().toISOString();
      for (const pricedItem of calculation.items) {
        const product = catalogStore.find((p) => p.id === pricedItem.productId)!;
        const variant = product.variants.find((v) => v.size === pricedItem.size)!;
        variant.stock -= pricedItem.quantity;
        product.updatedAt = nowIso;
      }

      // Generate non-sequential order number and per-order access token
      let randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      while (ordersStore.some((o) => o.orderNumber === `JV-2610-${randomSuffix}`)) {
        randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      }
      const orderNumber = `JV-2610-${randomSuffix}`;
      const orderAccessToken = crypto.randomBytes(16).toString('hex');

      const initialPaymentStatus: PaymentStatus =
        selectedPayment === 'COD' ? 'UNPAID_COD' : 'PENDING_VERIFICATION';

      const newOrder: StoredOrder = {
        id: `ord-${Date.now()}-${randomSuffix.toLowerCase()}`,
        orderNumber,
        idempotencyKey: cleanIdempotencyKey,
        orderAccessToken,
        isDemoOrder: false,
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
        paymentStatus: initialPaymentStatus,
        orderStatus: 'PENDING_CONFIRMATION',
        items: calculation.items,
        itemCount: calculation.itemCount,
        subtotalBdt: calculation.subtotalBdt,
        customizationTotalBdt: calculation.customizationTotalBdt,
        discountBdt: calculation.discountBdt,
        appliedCouponCode: calculation.appliedCouponCode,
        shippingBdt: calculation.shippingBdt,
        shippingZoneLabel: calculation.shippingZoneLabel,
        totalBdt: calculation.totalBdt,
        createdAt: nowIso,
        updatedAt: nowIso,
        statusHistory: [
          {
            status: 'PENDING_CONFIRMATION',
            paymentStatus: initialPaymentStatus,
            timestamp: nowIso,
            note:
              selectedPayment === 'COD'
                ? 'Order placed via Cash on Delivery. Payment remains UNPAID until doorstep delivery.'
                : `Order placed via ${selectedPayment}. Awaiting server-side gateway verification.`
          }
        ]
      };

      ordersStore.unshift(newOrder);
      return res.status(201).json({
        order: sanitizeOrderForClient(newOrder),
        orderAccessToken
      });
    } finally {
      inFlightIdempotencyKeys.delete(cleanIdempotencyKey);
    }
  });

  // Helper to verify whether a requester is authorized to view or cancel a specific order
  async function verifyOrderAccess(req: express.Request, order: StoredOrder): Promise<{
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
  app.get('/api/orders/:orderNumber', async (req, res) => {
    const rawNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    // Map legacy sample order alias JV-2026-1001 to JV-DEMO-0001
    const lookupNumber = rawNumber === 'JV-2026-1001' ? 'JV-DEMO-0001' : rawNumber;

    const found = ordersStore.find((o) => o.orderNumber.toUpperCase() === lookupNumber);
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

    const matching = ordersStore
      .filter((o) => !o.isDemoOrder && o.userId === user.uid)
      .map(sanitizeOrderForClient);

    return res.json({ orders: matching });
  });

  // Customer Cancellation of Pending Order (Requires ownership verification)
  app.post('/api/orders/:orderNumber/cancel', async (req, res) => {
    const rawNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    const lookupNumber = rawNumber === 'JV-2026-1001' ? 'JV-DEMO-0001' : rawNumber;
    const order = ordersStore.find((o) => o.orderNumber.toUpperCase() === lookupNumber);
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

    const check = validateOrderStateTransition({
      currentOrderStatus: order.orderStatus,
      currentPaymentStatus: order.paymentStatus,
      nextOrderStatus: 'CANCELLED',
      nextPaymentStatus: order.paymentStatus,
      actorRole: 'customer'
    });

    if (!check.allowed) {
      return res.status(400).json({ error: check.error });
    }

    // Restore variant inventory atomically
    for (const item of order.items) {
      const product = catalogStore.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.size === item.size);
      if (variant) {
        variant.stock += item.quantity;
      }
    }

    const nowIso = new Date().toISOString();
    order.orderStatus = 'CANCELLED';
    order.updatedAt = nowIso;
    order.statusHistory.push({
      status: 'CANCELLED',
      paymentStatus: order.paymentStatus,
      timestamp: nowIso,
      note: 'Order cancelled by verified customer prior to dispatch confirmation. Stock restored.'
    });

    return res.json({ order: sanitizeOrderForClient(order) });
  });

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

    // Real orders vs sample demonstration orders are strictly separated in financial metrics
    const realOrders = ordersStore.filter((o) => !o.isDemoOrder);
    const demoOrders = ordersStore.filter((o) => o.isDemoOrder);
    const activeRealOrders = realOrders.filter((o) => o.orderStatus !== 'CANCELLED');

    const totalRevenueBookedBdt = activeRealOrders.reduce((acc, o) => acc + o.totalBdt, 0);
    const verifiedPaidRevenueBdt = realOrders
      .filter((o) => o.paymentStatus === 'VERIFIED')
      .reduce((acc, o) => acc + o.totalBdt, 0);
    const pendingCodBdt = activeRealOrders
      .filter((o) => o.paymentStatus === 'UNPAID_COD')
      .reduce((acc, o) => acc + o.totalBdt, 0);

    const totalStockUnits = catalogStore.reduce(
      (acc, p) => acc + p.variants.reduce((vAcc, v) => vAcc + v.stock, 0),
      0
    );

    // Non-admin read-only preview never receives real customer orders or customer PII
    const visibleOrders = isAdmin
      ? ordersStore.map(sanitizeOrderForClient)
      : demoOrders.map(sanitizeOrderForClient);

    return res.json({
      authorizedAdmin: isAdmin,
      metrics: {
        totalOrders: realOrders.length,
        demoOrdersCount: demoOrders.length,
        activeOrdersCount: activeRealOrders.length,
        totalRevenueBookedBdt,
        verifiedPaidRevenueBdt,
        pendingCodBdt,
        totalProducts: catalogStore.length,
        totalStockUnits
      },
      orders: visibleOrders,
      products: catalogStore,
      coupons: couponsStore,
      settings: siteSettingsStore
    });
  });

  app.patch('/api/admin/orders/:orderNumber', requireAdminMiddleware, (req, res) => {
    const orderNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    const { orderStatus, paymentStatus, note } = req.body ?? {};
    const order = ordersStore.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const nextOrderStatus: OrderStatus = orderStatus ?? order.orderStatus;
    const nextPaymentStatus: PaymentStatus = paymentStatus ?? order.paymentStatus;

    const check = validateOrderStateTransition({
      currentOrderStatus: order.orderStatus,
      currentPaymentStatus: order.paymentStatus,
      nextOrderStatus,
      nextPaymentStatus,
      actorRole: 'admin'
    });

    if (!check.allowed) {
      return res.status(400).json({ error: check.error });
    }

    // If transitioning to CANCELLED from a non-cancelled state, restore inventory
    if (order.orderStatus !== 'CANCELLED' && nextOrderStatus === 'CANCELLED') {
      for (const item of order.items) {
        const product = catalogStore.find((p) => p.id === item.productId);
        const variant = product?.variants.find((v) => v.size === item.size);
        if (variant) {
          variant.stock += item.quantity;
        }
      }
    }

    const nowIso = new Date().toISOString();
    order.orderStatus = nextOrderStatus;
    order.paymentStatus = nextPaymentStatus;
    order.updatedAt = nowIso;
    order.statusHistory.push({
      status: nextOrderStatus,
      paymentStatus: nextPaymentStatus,
      timestamp: nowIso,
      note:
        typeof note === 'string' && note.trim()
          ? note.trim().slice(0, 250)
          : `Admin updated status to ${nextOrderStatus} / ${nextPaymentStatus}.`
    });

    return res.json({ order: sanitizeOrderForClient(order) });
  });

  app.patch('/api/admin/products/:productId/stock', requireAdminMiddleware, (req, res) => {
    const productId = String(req.params.productId ?? '').trim();
    const { size, stock, priceBdt } = req.body ?? {};
    const product = catalogStore.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const variant = product.variants.find((v) => v.size === (size as JerseySize));
    if (!variant) {
      return res.status(404).json({ error: `Variant size ${size} not found.` });
    }

    if (typeof stock !== 'undefined') {
      if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0 || stock > 5000) {
        return res.status(400).json({ error: 'Stock must be a valid number between 0 and 5000.' });
      }
      variant.stock = Math.floor(stock);
    }

    if (typeof priceBdt !== 'undefined') {
      if (typeof priceBdt !== 'number' || !Number.isFinite(priceBdt) || priceBdt < 300 || priceBdt > 25000) {
        return res.status(400).json({ error: 'Price must be between ৳300 and ৳25,000.' });
      }
      variant.priceBdt = Math.round(priceBdt);
      product.priceBdt = Math.round(priceBdt);
    }

    product.updatedAt = new Date().toISOString();
    return res.json({ product });
  });

  app.patch('/api/admin/settings', requireAdminMiddleware, (req, res) => {
    const {
      announcementText,
      insideDhakaShippingBdt,
      outsideDhakaShippingBdt,
      freeShippingThresholdBdt
    } = req.body ?? {};

    if (typeof announcementText === 'string') {
      const cleanText = announcementText.trim();
      if (cleanText.length < 5 || cleanText.length > 240) {
        return res.status(400).json({ error: 'Announcement text must be between 5 and 240 characters.' });
      }
      siteSettingsStore.announcementText = cleanText;
    }
    if (typeof insideDhakaShippingBdt === 'number') {
      if (!Number.isFinite(insideDhakaShippingBdt) || insideDhakaShippingBdt < 0 || insideDhakaShippingBdt > 1000) {
        return res.status(400).json({ error: 'Inside Dhaka shipping rate must be between ৳0 and ৳1,000.' });
      }
      siteSettingsStore.insideDhakaShippingBdt = Math.round(insideDhakaShippingBdt);
    }
    if (typeof outsideDhakaShippingBdt === 'number') {
      if (!Number.isFinite(outsideDhakaShippingBdt) || outsideDhakaShippingBdt < 0 || outsideDhakaShippingBdt > 2000) {
        return res.status(400).json({ error: 'Outside Dhaka shipping rate must be between ৳0 and ৳2,000.' });
      }
      siteSettingsStore.outsideDhakaShippingBdt = Math.round(outsideDhakaShippingBdt);
    }
    if (typeof freeShippingThresholdBdt === 'number') {
      if (!Number.isFinite(freeShippingThresholdBdt) || freeShippingThresholdBdt < 0 || freeShippingThresholdBdt > 50000) {
        return res.status(400).json({ error: 'Free shipping threshold must be between ৳0 and ৳50,000.' });
      }
      siteSettingsStore.freeShippingThresholdBdt = Math.round(freeShippingThresholdBdt);
    }
    siteSettingsStore.updatedAt = new Date().toISOString();

    return res.json({ settings: siteSettingsStore });
  });

  // 6. SEO Endpoints: robots.txt and sitemap.xml
  app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${baseUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const productUrls = catalogStore
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

// Only start listening if server.ts is executed directly (allows importing createJerseyValleyApp in tests)
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
