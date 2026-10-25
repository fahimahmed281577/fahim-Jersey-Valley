import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredOrder {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
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

// Authoritative server-side state initialized with demonstration catalog and 1 sample order
const catalogStore: Product[] = structuredClone(INITIAL_CATALOG);
const couponsStore: CouponDefinition[] = structuredClone(INITIAL_COUPONS);
let siteSettingsStore: SiteSettingsConfig = structuredClone(INITIAL_SITE_SETTINGS);

const ordersStore: StoredOrder[] = [
  {
    id: 'ord-demo-1001',
    orderNumber: 'JV-2026-1001',
    idempotencyKey: 'seed-order-1001',
    userId: 'demo-customer',
    customerName: 'Tanvir Ahmed',
    customerPhone: '01711223344',
    customerEmail: 'tanvir.dhaka@example.com',
    division: 'Dhaka',
    district: 'Dhaka',
    upazila: 'Dhanmondi',
    streetAddress: 'House 24, Road 9/A, Dhanmondi',
    postalCode: '1209',
    deliveryNotes: 'Call before arrival at gate.',
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
        note: 'Order placed via Cash on Delivery (Sample Order).'
      },
      {
        status: 'CONFIRMED',
        paymentStatus: 'UNPAID_COD',
        timestamp: '2026-10-24T17:10:00.000Z',
        note: 'Phone verification completed by Jersey Valley Dhaka dispatch desk.'
      }
    ]
  }
];

let orderSequence = 1002;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

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
  app.post('/api/orders', (req, res) => {
    const {
      idempotencyKey,
      userId,
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

    // Idempotency protection against duplicate submissions
    if (typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0) {
      const existingOrder = ordersStore.find((o) => o.idempotencyKey === idempotencyKey.trim());
      if (existingOrder) {
        return res.status(200).json({ order: existingOrder, duplicatePrevented: true });
      }
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

    if (!cleanDivision || !cleanDistrict || !cleanUpazila || cleanStreet.length < 4) {
      return res.status(400).json({
        error: 'Complete Bangladesh address (Division, District, Upazila/Thana, and Street Address) is required.'
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

    // Deduct variant inventory atomically in memory
    for (const pricedItem of calculation.items) {
      const product = catalogStore.find((p) => p.id === pricedItem.productId);
      const variant = product?.variants.find((v) => v.size === pricedItem.size);
      if (!product || !variant || variant.stock < pricedItem.quantity) {
        return res.status(409).json({
          error: `Stock changed for ${pricedItem.productName} (${pricedItem.size}). Please review your cart.`
        });
      }
      variant.stock -= pricedItem.quantity;
      product.updatedAt = new Date().toISOString();
    }

    const nowIso = new Date().toISOString();
    const orderNumber = `JV-2026-${orderSequence++}`;
    const initialPaymentStatus: PaymentStatus =
      selectedPayment === 'COD' ? 'UNPAID_COD' : 'PENDING_VERIFICATION';

    const newOrder: StoredOrder = {
      id: `ord-${Date.now()}`,
      orderNumber,
      idempotencyKey:
        typeof idempotencyKey === 'string' && idempotencyKey.trim()
          ? idempotencyKey.trim()
          : `auto-${Date.now()}`,
      userId: typeof userId === 'string' && userId.trim() ? userId.trim() : null,
      customerName: trimmedName,
      customerPhone: phoneValidation.normalized,
      customerEmail: String(customerEmail ?? '').trim(),
      division: cleanDivision,
      district: cleanDistrict,
      upazila: cleanUpazila,
      streetAddress: cleanStreet,
      postalCode: String(postalCode ?? '').trim(),
      deliveryNotes: String(deliveryNotes ?? '').trim(),
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
    return res.status(201).json({ order: newOrder });
  });

  // 4. Order Lookup & Tracking API
  app.get('/api/orders/:orderNumber', (req, res) => {
    const orderNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    const found = ordersStore.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!found) {
      return res.status(404).json({ error: `Order ${orderNumber} was not found.` });
    }
    return res.json({ order: found });
  });

  // Customer Order List by userId or phone
  app.get('/api/customer/orders', (req, res) => {
    const userId = String(req.query.userId ?? '').trim();
    const phone = String(req.query.phone ?? '').trim();
    const matching = ordersStore.filter((o) => {
      if (userId && o.userId === userId) return true;
      if (phone && o.customerPhone === phone) return true;
      return false;
    });
    res.json({ orders: matching });
  });

  // Customer Cancellation of Pending Order
  app.post('/api/orders/:orderNumber/cancel', (req, res) => {
    const orderNumber = String(req.params.orderNumber ?? '').trim().toUpperCase();
    const order = ordersStore.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
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

    // Restore variant inventory
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
      note: 'Order cancelled by customer prior to dispatch confirmation. Stock restored.'
    });

    return res.json({ order });
  });

  // 5. Admin Overview & Management APIs
  app.get('/api/admin/overview', (_req, res) => {
    const activeOrders = ordersStore.filter((o) => o.orderStatus !== 'CANCELLED');
    const totalRevenueBookedBdt = activeOrders.reduce((acc, o) => acc + o.totalBdt, 0);
    const verifiedPaidRevenueBdt = ordersStore
      .filter((o) => o.paymentStatus === 'VERIFIED')
      .reduce((acc, o) => acc + o.totalBdt, 0);
    const pendingCodBdt = activeOrders
      .filter((o) => o.paymentStatus === 'UNPAID_COD')
      .reduce((acc, o) => acc + o.totalBdt, 0);

    const totalStockUnits = catalogStore.reduce(
      (acc, p) => acc + p.variants.reduce((vAcc, v) => vAcc + v.stock, 0),
      0
    );

    res.json({
      metrics: {
        totalOrders: ordersStore.length,
        activeOrdersCount: activeOrders.length,
        totalRevenueBookedBdt,
        verifiedPaidRevenueBdt,
        pendingCodBdt,
        totalProducts: catalogStore.length,
        totalStockUnits
      },
      orders: ordersStore,
      products: catalogStore,
      coupons: couponsStore,
      settings: siteSettingsStore
    });
  });

  app.patch('/api/admin/orders/:orderNumber', (req, res) => {
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
          ? note.trim()
          : `Admin updated status to ${nextOrderStatus} / ${nextPaymentStatus}.`
    });

    return res.json({ order });
  });

  app.patch('/api/admin/products/:productId/stock', (req, res) => {
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

    if (typeof stock === 'number' && stock >= 0 && stock <= 5000) {
      variant.stock = Math.floor(stock);
    }
    if (typeof priceBdt === 'number' && priceBdt >= 300 && priceBdt <= 25000) {
      variant.priceBdt = Math.round(priceBdt);
      product.priceBdt = Math.round(priceBdt);
    }
    product.updatedAt = new Date().toISOString();

    return res.json({ product });
  });

  app.patch('/api/admin/settings', (req, res) => {
    const {
      announcementText,
      insideDhakaShippingBdt,
      outsideDhakaShippingBdt,
      freeShippingThresholdBdt
    } = req.body ?? {};

    if (typeof announcementText === 'string' && announcementText.trim().length >= 5) {
      siteSettingsStore.announcementText = announcementText.trim();
    }
    if (typeof insideDhakaShippingBdt === 'number' && insideDhakaShippingBdt >= 0) {
      siteSettingsStore.insideDhakaShippingBdt = Math.round(insideDhakaShippingBdt);
    }
    if (typeof outsideDhakaShippingBdt === 'number' && outsideDhakaShippingBdt >= 0) {
      siteSettingsStore.outsideDhakaShippingBdt = Math.round(outsideDhakaShippingBdt);
    }
    if (typeof freeShippingThresholdBdt === 'number' && freeShippingThresholdBdt >= 0) {
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

startServer();
