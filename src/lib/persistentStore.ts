import crypto from 'node:crypto';
import fs from 'node:fs';
import { getApps, initializeApp, cert, type App as AdminApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  calculateOrderTotals,
  validateOrderStateTransition,
  type Product,
  type CouponDefinition,
  type SiteSettingsConfig,
  type PricedOrderItem,
  type PaymentMethod,
  type PaymentStatus,
  type OrderStatus,
  type JerseySize,
  type CartItemInput
} from './commerce';
import {
  INITIAL_CATALOG,
  INITIAL_COUPONS,
  INITIAL_SITE_SETTINGS
} from '../data/catalog';

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

export class StoreError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'StoreError';
    this.statusCode = statusCode;
  }
}

export interface CreateOrderTransactionInput {
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
  couponCode?: string;
  items: CartItemInput[];
}

export interface PersistenceAdapter {
  readonly backendType: 'firestore-admin' | 'transactional-store';
  getCatalogAndSettings(): Promise<{
    products: Product[];
    coupons: CouponDefinition[];
    settings: SiteSettingsConfig;
  }>;
  getOrderByNumber(orderNumber: string): Promise<StoredOrder | null>;
  listCustomerOrders(userId: string): Promise<StoredOrder[]>;
  listAllOrders(): Promise<StoredOrder[]>;
  createOrderAtomic(
    input: CreateOrderTransactionInput
  ): Promise<{ order: StoredOrder; duplicatePrevented: boolean }>;
  cancelOrderAtomic(
    orderNumber: string,
    actorRole: 'customer' | 'admin',
    note?: string
  ): Promise<StoredOrder>;
  updateOrderStatusAtomic(params: {
    orderNumber: string;
    nextOrderStatus: OrderStatus;
    nextPaymentStatus: PaymentStatus;
    note?: string;
  }): Promise<StoredOrder>;
  updateVariantStockAtomic(params: {
    productId: string;
    size: JerseySize;
    stock?: number;
    priceBdt?: number;
  }): Promise<Product>;
  updateSiteSettingsAtomic(
    patch: Partial<
      Pick<
        SiteSettingsConfig,
        | 'announcementText'
        | 'insideDhakaShippingBdt'
        | 'outsideDhakaShippingBdt'
        | 'freeShippingThresholdBdt'
      >
    >
  ): Promise<SiteSettingsConfig>;
}

export const DEMO_SEED_ORDER: StoredOrder = {
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
};

export function isBkashConfiguredFromEnv(): boolean {
  return Boolean(
    process.env.BKASH_APP_KEY &&
      process.env.BKASH_APP_SECRET &&
      process.env.BKASH_USERNAME &&
      process.env.BKASH_PASSWORD
  );
}

export function isNagadConfiguredFromEnv(): boolean {
  return Boolean(
    process.env.NAGAD_MERCHANT_ID &&
      process.env.NAGAD_PG_PUBLIC_KEY &&
      process.env.NAGAD_MERCHANT_PRIVATE_KEY
  );
}

function withEnvGatewayFlags(settings: SiteSettingsConfig): SiteSettingsConfig {
  return {
    ...settings,
    bkashMerchantEnabled: isBkashConfiguredFromEnv(),
    nagadMerchantEnabled: isNagadConfiguredFromEnv()
  };
}

/**
 * Concurrency-safe transactional store with an async mutex lock and optional JSON file persistence.
 * Guarantees that concurrent requests within a Node process execute stock checks, deductions,
 * and idempotency registration strictly one at a time with full rollback on error.
 */
export class TransactionalStoreAdapter implements PersistenceAdapter {
  public readonly backendType = 'transactional-store' as const;
  private catalog: Product[];
  private coupons: CouponDefinition[];
  private settings: SiteSettingsConfig;
  private orders: Map<string, StoredOrder>;
  private idempotencyIndex: Map<string, string>;
  private mutexQueue: Promise<void> = Promise.resolve();
  private readonly snapshotFilePath?: string;

  constructor(options?: { snapshotFilePath?: string }) {
    this.snapshotFilePath = options?.snapshotFilePath;
    this.catalog = structuredClone(INITIAL_CATALOG);
    this.coupons = structuredClone(INITIAL_COUPONS);
    this.settings = withEnvGatewayFlags(structuredClone(INITIAL_SITE_SETTINGS));
    this.orders = new Map([[DEMO_SEED_ORDER.orderNumber, structuredClone(DEMO_SEED_ORDER)]]);
    this.idempotencyIndex = new Map([
      [DEMO_SEED_ORDER.idempotencyKey, DEMO_SEED_ORDER.orderNumber]
    ]);

    if (this.snapshotFilePath) {
      this.loadSnapshotFromDisk();
    }
  }

  private loadSnapshotFromDisk(): void {
    if (!this.snapshotFilePath || !fs.existsSync(this.snapshotFilePath)) return;
    try {
      const raw = fs.readFileSync(this.snapshotFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        catalog?: Product[];
        settings?: SiteSettingsConfig;
        orders?: StoredOrder[];
      };
      if (Array.isArray(parsed.catalog) && parsed.catalog.length > 0) {
        this.catalog = parsed.catalog;
      }
      if (parsed.settings) {
        this.settings = withEnvGatewayFlags(parsed.settings);
      }
      if (Array.isArray(parsed.orders)) {
        this.orders.clear();
        this.idempotencyIndex.clear();
        for (const ord of parsed.orders) {
          this.orders.set(ord.orderNumber.toUpperCase(), ord);
          this.idempotencyIndex.set(ord.idempotencyKey, ord.orderNumber.toUpperCase());
        }
      }
    } catch {
      // Keep default seeded state if snapshot is unreadable
    }
  }

  private persistSnapshotToDisk(): void {
    if (!this.snapshotFilePath) return;
    try {
      const payload = {
        catalog: this.catalog,
        settings: this.settings,
        orders: Array.from(this.orders.values())
      };
      fs.writeFileSync(this.snapshotFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore write errors in read-only filesystems
    }
  }

  private runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const resultPromise = this.mutexQueue.then(() => fn());
    this.mutexQueue = resultPromise.then(
      () => undefined,
      () => undefined
    );
    return resultPromise;
  }

  async getCatalogAndSettings() {
    this.loadSnapshotFromDisk();
    this.settings = withEnvGatewayFlags(this.settings);
    return {
      products: structuredClone(this.catalog),
      coupons: structuredClone(this.coupons.filter((c) => c.isActive)),
      settings: structuredClone(this.settings)
    };
  }

  async getOrderByNumber(orderNumber: string): Promise<StoredOrder | null> {
    this.loadSnapshotFromDisk();
    const lookup =
      orderNumber.trim().toUpperCase() === 'JV-2026-1001'
        ? 'JV-DEMO-0001'
        : orderNumber.trim().toUpperCase();
    const found = this.orders.get(lookup);
    return found ? structuredClone(found) : null;
  }

  async listCustomerOrders(userId: string): Promise<StoredOrder[]> {
    this.loadSnapshotFromDisk();
    return Array.from(this.orders.values())
      .filter((o) => !o.isDemoOrder && o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(o));
  }

  async listAllOrders(): Promise<StoredOrder[]> {
    this.loadSnapshotFromDisk();
    return Array.from(this.orders.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(o));
  }

  async createOrderAtomic(
    input: CreateOrderTransactionInput
  ): Promise<{ order: StoredOrder; duplicatePrevented: boolean }> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      this.settings = withEnvGatewayFlags(this.settings);

      // 1. Atomic Idempotency Check inside Mutex Transaction
      const existingOrderNum = this.idempotencyIndex.get(input.idempotencyKey);
      if (existingOrderNum) {
        const existingOrder = this.orders.get(existingOrderNum);
        if (existingOrder) {
          return {
            order: structuredClone(existingOrder),
            duplicatePrevented: true
          };
        }
      }

      // 2. Payment gateway guard
      if (input.paymentMethod === 'BKASH' && !this.settings.bkashMerchantEnabled) {
        throw new StoreError(
          400,
          'bKash Tokenized Checkout merchant credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        );
      }
      if (input.paymentMethod === 'NAGAD' && !this.settings.nagadMerchantEnabled) {
        throw new StoreError(
          400,
          'Nagad Merchant PGW credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        );
      }

      // 3. Authoritative server-side price, coupon & shipping calculation against current locked stock
      const calculation = calculateOrderTotals({
        items: input.items,
        catalog: this.catalog,
        coupons: this.coupons,
        settings: this.settings,
        couponCode: input.couponCode,
        division: input.division,
        district: input.district
      });

      if (!calculation.valid) {
        const isStockError =
          calculation.error?.includes('Only ') ||
          calculation.error?.includes('out of stock') ||
          calculation.error?.includes('Stock changed');
        throw new StoreError(
          isStockError ? 409 : 400,
          calculation.error ?? 'Order calculation failed.'
        );
      }

      // 4. Verify and deduct variant stock atomically on a working copy before committing
      const nextCatalog = structuredClone(this.catalog);
      const nowIso = new Date().toISOString();

      for (const pricedItem of calculation.items) {
        const product = nextCatalog.find((p) => p.id === pricedItem.productId);
        const variant = product?.variants.find((v) => v.size === pricedItem.size && v.isActive);
        if (!product || !variant || variant.stock < pricedItem.quantity) {
          throw new StoreError(
            409,
            `Stock changed for ${pricedItem.productName} (${pricedItem.size}). Available: ${variant?.stock ?? 0}.`
          );
        }
        variant.stock -= pricedItem.quantity;
        product.updatedAt = nowIso;
      }

      // 5. Generate unique non-sequential order number
      let randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      while (this.orders.has(`JV-2610-${randomSuffix}`)) {
        randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      }
      const orderNumber = `JV-2610-${randomSuffix}`;
      const orderAccessToken = crypto.randomBytes(16).toString('hex');
      const initialPaymentStatus: PaymentStatus =
        input.paymentMethod === 'COD' ? 'UNPAID_COD' : 'PENDING_VERIFICATION';

      const newOrder: StoredOrder = {
        id: `ord-${Date.now()}-${randomSuffix.toLowerCase()}`,
        orderNumber,
        idempotencyKey: input.idempotencyKey,
        orderAccessToken,
        isDemoOrder: false,
        userId: input.userId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        division: input.division,
        district: input.district,
        upazila: input.upazila,
        streetAddress: input.streetAddress,
        postalCode: input.postalCode,
        deliveryNotes: input.deliveryNotes,
        paymentMethod: input.paymentMethod,
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
              input.paymentMethod === 'COD'
                ? 'Order placed via Cash on Delivery. Payment remains UNPAID until doorstep delivery.'
                : `Order placed via ${input.paymentMethod}. Awaiting server-side gateway verification.`
          }
        ]
      };

      // Commit transaction
      this.catalog = nextCatalog;
      this.orders.set(orderNumber, newOrder);
      this.idempotencyIndex.set(input.idempotencyKey, orderNumber);
      this.persistSnapshotToDisk();

      return {
        order: structuredClone(newOrder),
        duplicatePrevented: false
      };
    });
  }

  async cancelOrderAtomic(
    orderNumber: string,
    actorRole: 'customer' | 'admin',
    note?: string
  ): Promise<StoredOrder> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const lookup =
        orderNumber.trim().toUpperCase() === 'JV-2026-1001'
          ? 'JV-DEMO-0001'
          : orderNumber.trim().toUpperCase();
      const existing = this.orders.get(lookup);
      if (!existing) {
        throw new StoreError(404, 'Order not found.');
      }

      const check = validateOrderStateTransition({
        currentOrderStatus: existing.orderStatus,
        currentPaymentStatus: existing.paymentStatus,
        nextOrderStatus: 'CANCELLED',
        nextPaymentStatus: existing.paymentStatus,
        actorRole
      });

      if (!check.allowed) {
        throw new StoreError(400, check.error || 'Order cannot be cancelled in its current state.');
      }

      const nextCatalog = structuredClone(this.catalog);
      const nowIso = new Date().toISOString();
      if (existing.orderStatus !== 'CANCELLED') {
        for (const item of existing.items) {
          const product = nextCatalog.find((p) => p.id === item.productId);
          const variant = product?.variants.find((v) => v.size === item.size);
          if (product && variant) {
            variant.stock += item.quantity;
            product.updatedAt = nowIso;
          }
        }
      }

      const updatedOrder: StoredOrder = {
        ...structuredClone(existing),
        orderStatus: 'CANCELLED',
        updatedAt: nowIso,
        statusHistory: [
          ...existing.statusHistory,
          {
            status: 'CANCELLED',
            paymentStatus: existing.paymentStatus,
            timestamp: nowIso,
            note:
              note ||
              'Order cancelled by verified customer prior to dispatch confirmation. Stock restored.'
          }
        ]
      };

      this.catalog = nextCatalog;
      this.orders.set(lookup, updatedOrder);
      this.persistSnapshotToDisk();
      return structuredClone(updatedOrder);
    });
  }

  async updateOrderStatusAtomic(params: {
    orderNumber: string;
    nextOrderStatus: OrderStatus;
    nextPaymentStatus: PaymentStatus;
    note?: string;
  }): Promise<StoredOrder> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const lookup = params.orderNumber.trim().toUpperCase();
      const existing = this.orders.get(lookup);
      if (!existing) {
        throw new StoreError(404, 'Order not found.');
      }

      const check = validateOrderStateTransition({
        currentOrderStatus: existing.orderStatus,
        currentPaymentStatus: existing.paymentStatus,
        nextOrderStatus: params.nextOrderStatus,
        nextPaymentStatus: params.nextPaymentStatus,
        actorRole: 'admin'
      });

      if (!check.allowed) {
        throw new StoreError(400, check.error || 'Invalid order state transition.');
      }

      const nextCatalog = structuredClone(this.catalog);
      const nowIso = new Date().toISOString();

      if (existing.orderStatus !== 'CANCELLED' && params.nextOrderStatus === 'CANCELLED') {
        for (const item of existing.items) {
          const product = nextCatalog.find((p) => p.id === item.productId);
          const variant = product?.variants.find((v) => v.size === item.size);
          if (product && variant) {
            variant.stock += item.quantity;
            product.updatedAt = nowIso;
          }
        }
      }

      const updatedOrder: StoredOrder = {
        ...structuredClone(existing),
        orderStatus: params.nextOrderStatus,
        paymentStatus: params.nextPaymentStatus,
        updatedAt: nowIso,
        statusHistory: [
          ...existing.statusHistory,
          {
            status: params.nextOrderStatus,
            paymentStatus: params.nextPaymentStatus,
            timestamp: nowIso,
            note:
              params.note && params.note.trim()
                ? params.note.trim().slice(0, 250)
                : `Admin updated status to ${params.nextOrderStatus} / ${params.nextPaymentStatus}.`
          }
        ]
      };

      this.catalog = nextCatalog;
      this.orders.set(lookup, updatedOrder);
      this.persistSnapshotToDisk();
      return structuredClone(updatedOrder);
    });
  }

  async updateVariantStockAtomic(params: {
    productId: string;
    size: JerseySize;
    stock?: number;
    priceBdt?: number;
  }): Promise<Product> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const nextCatalog = structuredClone(this.catalog);
      const product = nextCatalog.find((p) => p.id === params.productId);
      if (!product) {
        throw new StoreError(404, 'Product not found.');
      }

      const variant = product.variants.find((v) => v.size === params.size);
      if (!variant) {
        throw new StoreError(404, `Variant size ${params.size} not found.`);
      }

      if (typeof params.stock !== 'undefined') {
        if (
          typeof params.stock !== 'number' ||
          !Number.isFinite(params.stock) ||
          params.stock < 0 ||
          params.stock > 5000
        ) {
          throw new StoreError(400, 'Stock must be a valid number between 0 and 5000.');
        }
        variant.stock = Math.floor(params.stock);
      }

      if (typeof params.priceBdt !== 'undefined') {
        if (
          typeof params.priceBdt !== 'number' ||
          !Number.isFinite(params.priceBdt) ||
          params.priceBdt < 300 ||
          params.priceBdt > 25000
        ) {
          throw new StoreError(400, 'Price must be between ৳300 and ৳25,000.');
        }
        variant.priceBdt = Math.round(params.priceBdt);
        product.priceBdt = Math.round(params.priceBdt);
      }

      product.updatedAt = new Date().toISOString();
      this.catalog = nextCatalog;
      this.persistSnapshotToDisk();
      return structuredClone(product);
    });
  }

  async updateSiteSettingsAtomic(
    patch: Partial<
      Pick<
        SiteSettingsConfig,
        | 'announcementText'
        | 'insideDhakaShippingBdt'
        | 'outsideDhakaShippingBdt'
        | 'freeShippingThresholdBdt'
      >
    >
  ): Promise<SiteSettingsConfig> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const nextSettings = structuredClone(this.settings);

      if (typeof patch.announcementText === 'string') {
        const cleanText = patch.announcementText.trim();
        if (cleanText.length < 5 || cleanText.length > 240) {
          throw new StoreError(400, 'Announcement text must be between 5 and 240 characters.');
        }
        nextSettings.announcementText = cleanText;
      }
      if (typeof patch.insideDhakaShippingBdt === 'number') {
        if (
          !Number.isFinite(patch.insideDhakaShippingBdt) ||
          patch.insideDhakaShippingBdt < 0 ||
          patch.insideDhakaShippingBdt > 1000
        ) {
          throw new StoreError(400, 'Inside Dhaka shipping rate must be between ৳0 and ৳1,000.');
        }
        nextSettings.insideDhakaShippingBdt = Math.round(patch.insideDhakaShippingBdt);
      }
      if (typeof patch.outsideDhakaShippingBdt === 'number') {
        if (
          !Number.isFinite(patch.outsideDhakaShippingBdt) ||
          patch.outsideDhakaShippingBdt < 0 ||
          patch.outsideDhakaShippingBdt > 2000
        ) {
          throw new StoreError(400, 'Outside Dhaka shipping rate must be between ৳0 and ৳2,000.');
        }
        nextSettings.outsideDhakaShippingBdt = Math.round(patch.outsideDhakaShippingBdt);
      }
      if (typeof patch.freeShippingThresholdBdt === 'number') {
        if (
          !Number.isFinite(patch.freeShippingThresholdBdt) ||
          patch.freeShippingThresholdBdt < 0 ||
          patch.freeShippingThresholdBdt > 50000
        ) {
          throw new StoreError(
            400,
            'Free shipping threshold must be between ৳0 and ৳50,000.'
          );
        }
        nextSettings.freeShippingThresholdBdt = Math.round(patch.freeShippingThresholdBdt);
      }

      nextSettings.updatedAt = new Date().toISOString();
      this.settings = withEnvGatewayFlags(nextSettings);
      this.persistSnapshotToDisk();
      return structuredClone(this.settings);
    });
  }
}

/**
 * Cloud Firestore Admin SDK Persistence Adapter for production Vercel Serverless deployments.
 * Uses Firestore multi-document transactions (`db.runTransaction`) to atomically:
 * - Verify idempotency in `/serverIdempotency/{idempotencyKey}`
 * - Read and deduct size-specific variant stock in `/serverCatalog/{productId}`
 * - Persist guest and customer orders in `/serverOrders/{orderNumber}`
 * - Persist storefront shipping & announcement settings in `/siteSettings/global`
 *
 * Because `/serverOrders`, `/serverCatalog`, and `/serverIdempotency` are accessed exclusively
 * via the server-side Firebase Admin SDK, client SDKs are completely blocked by `firestore.rules`
 * default-deny (`allow read, write: if false`).
 */
export class FirestoreAdminPersistenceAdapter implements PersistenceAdapter {
  public readonly backendType = 'firestore-admin' as const;
  private readonly db: Firestore;
  private readonly coupons: CouponDefinition[] = structuredClone(INITIAL_COUPONS);
  private seededPromise: Promise<void> | null = null;

  constructor(db: Firestore) {
    this.db = db;
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seededPromise) {
      this.seededPromise = (async () => {
        const settingsRef = this.db.collection('siteSettings').doc('global');
        const settingsSnap = await settingsRef.get();
        if (!settingsSnap.exists) {
          await settingsRef.set(withEnvGatewayFlags(structuredClone(INITIAL_SITE_SETTINGS)));
        }

        const firstProductRef = this.db.collection('serverCatalog').doc(INITIAL_CATALOG[0].id);
        const firstProductSnap = await firstProductRef.get();
        if (!firstProductSnap.exists) {
          const batch = this.db.batch();
          for (const prod of INITIAL_CATALOG) {
            batch.set(this.db.collection('serverCatalog').doc(prod.id), structuredClone(prod));
          }
          batch.set(
            this.db.collection('serverOrders').doc(DEMO_SEED_ORDER.orderNumber),
            structuredClone(DEMO_SEED_ORDER)
          );
          batch.set(
            this.db.collection('serverIdempotency').doc(DEMO_SEED_ORDER.idempotencyKey),
            {
              idempotencyKey: DEMO_SEED_ORDER.idempotencyKey,
              orderNumber: DEMO_SEED_ORDER.orderNumber,
              createdAt: DEMO_SEED_ORDER.createdAt
            }
          );
          await batch.commit();
        }
      })();
    }
    return this.seededPromise;
  }

  async getCatalogAndSettings(): Promise<{
    products: Product[];
    coupons: CouponDefinition[];
    settings: SiteSettingsConfig;
  }> {
    await this.ensureSeeded();
    const [catalogSnap, settingsSnap] = await Promise.all([
      this.db.collection('serverCatalog').get(),
      this.db.collection('siteSettings').doc('global').get()
    ]);

    const products: Product[] = catalogSnap.docs
      .map((d) => d.data() as Product)
      .sort((a, b) => a.featuredRank - b.featuredRank);

    const rawSettings = settingsSnap.exists
      ? (settingsSnap.data() as SiteSettingsConfig)
      : structuredClone(INITIAL_SITE_SETTINGS);

    return {
      products: products.length > 0 ? products : structuredClone(INITIAL_CATALOG),
      coupons: structuredClone(this.coupons.filter((c) => c.isActive)),
      settings: withEnvGatewayFlags(rawSettings)
    };
  }

  async getOrderByNumber(orderNumber: string): Promise<StoredOrder | null> {
    await this.ensureSeeded();
    const lookup =
      orderNumber.trim().toUpperCase() === 'JV-2026-1001'
        ? 'JV-DEMO-0001'
        : orderNumber.trim().toUpperCase();
    const snap = await this.db.collection('serverOrders').doc(lookup).get();
    if (!snap.exists) return null;
    return snap.data() as StoredOrder;
  }

  async listCustomerOrders(userId: string): Promise<StoredOrder[]> {
    await this.ensureSeeded();
    const snap = await this.db
      .collection('serverOrders')
      .where('userId', '==', userId)
      .get();
    return snap.docs
      .map((d) => d.data() as StoredOrder)
      .filter((o) => !o.isDemoOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAllOrders(): Promise<StoredOrder[]> {
    await this.ensureSeeded();
    const snap = await this.db.collection('serverOrders').get();
    return snap.docs
      .map((d) => d.data() as StoredOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createOrderAtomic(
    input: CreateOrderTransactionInput
  ): Promise<{ order: StoredOrder; duplicatePrevented: boolean }> {
    await this.ensureSeeded();

    return this.db.runTransaction(async (tx: Transaction) => {
      // 1. Check idempotency key inside Firestore transaction
      const idemRef = this.db.collection('serverIdempotency').doc(input.idempotencyKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const existingOrderNum = String(idemSnap.data()?.orderNumber || '');
        if (existingOrderNum) {
          const existingOrderRef = this.db.collection('serverOrders').doc(existingOrderNum);
          const existingOrderSnap = await tx.get(existingOrderRef);
          if (existingOrderSnap.exists) {
            return {
              order: existingOrderSnap.data() as StoredOrder,
              duplicatePrevented: true
            };
          }
        }
      }

      // 2. Read site settings inside transaction
      const settingsRef = this.db.collection('siteSettings').doc('global');
      const settingsSnap = await tx.get(settingsRef);
      const settings = withEnvGatewayFlags(
        settingsSnap.exists
          ? (settingsSnap.data() as SiteSettingsConfig)
          : structuredClone(INITIAL_SITE_SETTINGS)
      );

      if (input.paymentMethod === 'BKASH' && !settings.bkashMerchantEnabled) {
        throw new StoreError(
          400,
          'bKash Tokenized Checkout merchant credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        );
      }
      if (input.paymentMethod === 'NAGAD' && !settings.nagadMerchantEnabled) {
        throw new StoreError(
          400,
          'Nagad Merchant PGW credentials are not yet configured in environment secrets. Please select Cash on Delivery (COD) to place your order now.'
        );
      }

      // 3. Read all referenced product documents inside the Firestore transaction
      const uniqueProductIds = Array.from(
        new Set((input.items || []).map((i) => String(i.productId || '')))
      ).filter(Boolean);

      if (uniqueProductIds.length === 0) {
        throw new StoreError(400, 'Cart cannot be empty.');
      }

      const productSnaps = await Promise.all(
        uniqueProductIds.map((pid) => tx.get(this.db.collection('serverCatalog').doc(pid)))
      );

      const lockedCatalog: Product[] = [];
      for (const snap of productSnaps) {
        if (snap.exists) {
          lockedCatalog.push(structuredClone(snap.data() as Product));
        }
      }

      // 4. Calculate totals & verify variant stock against transactionally locked products
      const calculation = calculateOrderTotals({
        items: input.items,
        catalog: lockedCatalog,
        coupons: this.coupons,
        settings,
        couponCode: input.couponCode,
        division: input.division,
        district: input.district
      });

      if (!calculation.valid) {
        const isStockError =
          calculation.error?.includes('Only ') ||
          calculation.error?.includes('out of stock') ||
          calculation.error?.includes('Stock changed');
        throw new StoreError(
          isStockError ? 409 : 400,
          calculation.error ?? 'Order calculation failed.'
        );
      }

      const nowIso = new Date().toISOString();
      for (const pricedItem of calculation.items) {
        const product = lockedCatalog.find((p) => p.id === pricedItem.productId);
        const variant = product?.variants.find((v) => v.size === pricedItem.size && v.isActive);
        if (!product || !variant || variant.stock < pricedItem.quantity) {
          throw new StoreError(
            409,
            `Stock changed for ${pricedItem.productName} (${pricedItem.size}). Available: ${variant?.stock ?? 0}.`
          );
        }
        variant.stock -= pricedItem.quantity;
        product.updatedAt = nowIso;
      }

      // 5. Generate unique non-sequential order number and verify no collision in transaction
      let randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      let orderNumber = `JV-2610-${randomSuffix}`;
      let orderRef = this.db.collection('serverOrders').doc(orderNumber);
      let orderCollisionSnap = await tx.get(orderRef);
      while (orderCollisionSnap.exists) {
        randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        orderNumber = `JV-2610-${randomSuffix}`;
        orderRef = this.db.collection('serverOrders').doc(orderNumber);
        orderCollisionSnap = await tx.get(orderRef);
      }

      const orderAccessToken = crypto.randomBytes(16).toString('hex');
      const initialPaymentStatus: PaymentStatus =
        input.paymentMethod === 'COD' ? 'UNPAID_COD' : 'PENDING_VERIFICATION';

      const newOrder: StoredOrder = {
        id: `ord-${Date.now()}-${randomSuffix.toLowerCase()}`,
        orderNumber,
        idempotencyKey: input.idempotencyKey,
        orderAccessToken,
        isDemoOrder: false,
        userId: input.userId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        division: input.division,
        district: input.district,
        upazila: input.upazila,
        streetAddress: input.streetAddress,
        postalCode: input.postalCode,
        deliveryNotes: input.deliveryNotes,
        paymentMethod: input.paymentMethod,
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
              input.paymentMethod === 'COD'
                ? 'Order placed via Cash on Delivery. Payment remains UNPAID until doorstep delivery.'
                : `Order placed via ${input.paymentMethod}. Awaiting server-side gateway verification.`
          }
        ]
      };

      // 6. Write updated products, new order, and idempotency lock atomically
      for (const updatedProd of lockedCatalog) {
        tx.set(this.db.collection('serverCatalog').doc(updatedProd.id), updatedProd);
      }
      tx.set(orderRef, newOrder);
      tx.set(idemRef, {
        idempotencyKey: input.idempotencyKey,
        orderNumber,
        createdAt: nowIso
      });

      return {
        order: newOrder,
        duplicatePrevented: false
      };
    });
  }

  async cancelOrderAtomic(
    orderNumber: string,
    actorRole: 'customer' | 'admin',
    note?: string
  ): Promise<StoredOrder> {
    await this.ensureSeeded();
    const lookup =
      orderNumber.trim().toUpperCase() === 'JV-2026-1001'
        ? 'JV-DEMO-0001'
        : orderNumber.trim().toUpperCase();

    return this.db.runTransaction(async (tx: Transaction) => {
      const orderRef = this.db.collection('serverOrders').doc(lookup);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new StoreError(404, 'Order not found.');
      }

      const existing = orderSnap.data() as StoredOrder;
      const check = validateOrderStateTransition({
        currentOrderStatus: existing.orderStatus,
        currentPaymentStatus: existing.paymentStatus,
        nextOrderStatus: 'CANCELLED',
        nextPaymentStatus: existing.paymentStatus,
        actorRole
      });

      if (!check.allowed) {
        throw new StoreError(400, check.error || 'Order cannot be cancelled in its current state.');
      }

      const uniqueProductIds = Array.from(new Set(existing.items.map((i) => i.productId)));
      const productSnaps = await Promise.all(
        uniqueProductIds.map((pid) => tx.get(this.db.collection('serverCatalog').doc(pid)))
      );

      const nowIso = new Date().toISOString();
      if (existing.orderStatus !== 'CANCELLED') {
        for (const prodSnap of productSnaps) {
          if (!prodSnap.exists) continue;
          const prod = structuredClone(prodSnap.data() as Product);
          for (const item of existing.items.filter((i) => i.productId === prod.id)) {
            const variant = prod.variants.find((v) => v.size === item.size);
            if (variant) {
              variant.stock += item.quantity;
            }
          }
          prod.updatedAt = nowIso;
          tx.set(this.db.collection('serverCatalog').doc(prod.id), prod);
        }
      }

      const updatedOrder: StoredOrder = {
        ...structuredClone(existing),
        orderStatus: 'CANCELLED',
        updatedAt: nowIso,
        statusHistory: [
          ...existing.statusHistory,
          {
            status: 'CANCELLED',
            paymentStatus: existing.paymentStatus,
            timestamp: nowIso,
            note:
              note ||
              'Order cancelled by verified customer prior to dispatch confirmation. Stock restored.'
          }
        ]
      };

      tx.set(orderRef, updatedOrder);
      return updatedOrder;
    });
  }

  async updateOrderStatusAtomic(params: {
    orderNumber: string;
    nextOrderStatus: OrderStatus;
    nextPaymentStatus: PaymentStatus;
    note?: string;
  }): Promise<StoredOrder> {
    await this.ensureSeeded();
    const lookup = params.orderNumber.trim().toUpperCase();

    return this.db.runTransaction(async (tx: Transaction) => {
      const orderRef = this.db.collection('serverOrders').doc(lookup);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) {
        throw new StoreError(404, 'Order not found.');
      }

      const existing = orderSnap.data() as StoredOrder;
      const check = validateOrderStateTransition({
        currentOrderStatus: existing.orderStatus,
        currentPaymentStatus: existing.paymentStatus,
        nextOrderStatus: params.nextOrderStatus,
        nextPaymentStatus: params.nextPaymentStatus,
        actorRole: 'admin'
      });

      if (!check.allowed) {
        throw new StoreError(400, check.error || 'Invalid order state transition.');
      }

      const nowIso = new Date().toISOString();
      if (existing.orderStatus !== 'CANCELLED' && params.nextOrderStatus === 'CANCELLED') {
        const uniqueProductIds = Array.from(new Set(existing.items.map((i) => i.productId)));
        const productSnaps = await Promise.all(
          uniqueProductIds.map((pid) => tx.get(this.db.collection('serverCatalog').doc(pid)))
        );
        for (const prodSnap of productSnaps) {
          if (!prodSnap.exists) continue;
          const prod = structuredClone(prodSnap.data() as Product);
          for (const item of existing.items.filter((i) => i.productId === prod.id)) {
            const variant = prod.variants.find((v) => v.size === item.size);
            if (variant) {
              variant.stock += item.quantity;
            }
          }
          prod.updatedAt = nowIso;
          tx.set(this.db.collection('serverCatalog').doc(prod.id), prod);
        }
      }

      const updatedOrder: StoredOrder = {
        ...structuredClone(existing),
        orderStatus: params.nextOrderStatus,
        paymentStatus: params.nextPaymentStatus,
        updatedAt: nowIso,
        statusHistory: [
          ...existing.statusHistory,
          {
            status: params.nextOrderStatus,
            paymentStatus: params.nextPaymentStatus,
            timestamp: nowIso,
            note:
              params.note && params.note.trim()
                ? params.note.trim().slice(0, 250)
                : `Admin updated status to ${params.nextOrderStatus} / ${params.nextPaymentStatus}.`
          }
        ]
      };

      tx.set(orderRef, updatedOrder);
      return updatedOrder;
    });
  }

  async updateVariantStockAtomic(params: {
    productId: string;
    size: JerseySize;
    stock?: number;
    priceBdt?: number;
  }): Promise<Product> {
    await this.ensureSeeded();
    return this.db.runTransaction(async (tx: Transaction) => {
      const prodRef = this.db.collection('serverCatalog').doc(params.productId);
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists) {
        throw new StoreError(404, 'Product not found.');
      }

      const product = structuredClone(prodSnap.data() as Product);
      const variant = product.variants.find((v) => v.size === params.size);
      if (!variant) {
        throw new StoreError(404, `Variant size ${params.size} not found.`);
      }

      if (typeof params.stock !== 'undefined') {
        if (
          typeof params.stock !== 'number' ||
          !Number.isFinite(params.stock) ||
          params.stock < 0 ||
          params.stock > 5000
        ) {
          throw new StoreError(400, 'Stock must be a valid number between 0 and 5000.');
        }
        variant.stock = Math.floor(params.stock);
      }

      if (typeof params.priceBdt !== 'undefined') {
        if (
          typeof params.priceBdt !== 'number' ||
          !Number.isFinite(params.priceBdt) ||
          params.priceBdt < 300 ||
          params.priceBdt > 25000
        ) {
          throw new StoreError(400, 'Price must be between ৳300 and ৳25,000.');
        }
        variant.priceBdt = Math.round(params.priceBdt);
        product.priceBdt = Math.round(params.priceBdt);
      }

      product.updatedAt = new Date().toISOString();
      tx.set(prodRef, product);
      return product;
    });
  }

  async updateSiteSettingsAtomic(
    patch: Partial<
      Pick<
        SiteSettingsConfig,
        | 'announcementText'
        | 'insideDhakaShippingBdt'
        | 'outsideDhakaShippingBdt'
        | 'freeShippingThresholdBdt'
      >
    >
  ): Promise<SiteSettingsConfig> {
    await this.ensureSeeded();
    return this.db.runTransaction(async (tx: Transaction) => {
      const settingsRef = this.db.collection('siteSettings').doc('global');
      const settingsSnap = await tx.get(settingsRef);
      const nextSettings = settingsSnap.exists
        ? structuredClone(settingsSnap.data() as SiteSettingsConfig)
        : structuredClone(INITIAL_SITE_SETTINGS);

      if (typeof patch.announcementText === 'string') {
        const cleanText = patch.announcementText.trim();
        if (cleanText.length < 5 || cleanText.length > 240) {
          throw new StoreError(400, 'Announcement text must be between 5 and 240 characters.');
        }
        nextSettings.announcementText = cleanText;
      }
      if (typeof patch.insideDhakaShippingBdt === 'number') {
        if (
          !Number.isFinite(patch.insideDhakaShippingBdt) ||
          patch.insideDhakaShippingBdt < 0 ||
          patch.insideDhakaShippingBdt > 1000
        ) {
          throw new StoreError(400, 'Inside Dhaka shipping rate must be between ৳0 and ৳1,000.');
        }
        nextSettings.insideDhakaShippingBdt = Math.round(patch.insideDhakaShippingBdt);
      }
      if (typeof patch.outsideDhakaShippingBdt === 'number') {
        if (
          !Number.isFinite(patch.outsideDhakaShippingBdt) ||
          patch.outsideDhakaShippingBdt < 0 ||
          patch.outsideDhakaShippingBdt > 2000
        ) {
          throw new StoreError(400, 'Outside Dhaka shipping rate must be between ৳0 and ৳2,000.');
        }
        nextSettings.outsideDhakaShippingBdt = Math.round(patch.outsideDhakaShippingBdt);
      }
      if (typeof patch.freeShippingThresholdBdt === 'number') {
        if (
          !Number.isFinite(patch.freeShippingThresholdBdt) ||
          patch.freeShippingThresholdBdt < 0 ||
          patch.freeShippingThresholdBdt > 50000
        ) {
          throw new StoreError(
            400,
            'Free shipping threshold must be between ৳0 and ৳50,000.'
          );
        }
        nextSettings.freeShippingThresholdBdt = Math.round(patch.freeShippingThresholdBdt);
      }

      nextSettings.updatedAt = new Date().toISOString();
      const finalSettings = withEnvGatewayFlags(nextSettings);
      tx.set(settingsRef, finalSettings);
      return finalSettings;
    });
  }
}

function loadProjectAndDbConfig(): { projectId: string; firestoreDatabaseId: string } {
  let fileConfig: { projectId?: string; firestoreDatabaseId?: string } = {};
  try {
    const raw = fs.readFileSync(
      new URL('../../firebase-applet-config.json', import.meta.url),
      'utf-8'
    );
    fileConfig = JSON.parse(raw);
  } catch {
    // ignore
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

/**
 * Resolves the Firebase Admin SDK Firestore instance if service-account credentials
 * (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`)
 * are configured in server environment variables. Never exposes secrets to client code.
 */
export function getFirebaseAdminFirestoreIfConfigured(): Firestore | null {
  const { projectId, firestoreDatabaseId } = loadProjectAndDbConfig();
  if (!projectId) return null;

  const serviceAccountJsonRaw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = (process.env.FIREBASE_PRIVATE_KEY || '').trim();

  if (!serviceAccountJsonRaw && (!clientEmail || !privateKeyRaw)) {
    return null;
  }

  let adminApp: AdminApp;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0]!;
  } else {
    if (serviceAccountJsonRaw) {
      const decodedJson = serviceAccountJsonRaw.startsWith('{')
        ? serviceAccountJsonRaw
        : Buffer.from(serviceAccountJsonRaw, 'base64').toString('utf-8');
      const parsedCreds = JSON.parse(decodedJson);
      adminApp = initializeApp({
        credential: cert(parsedCreds),
        projectId: parsedCreds.project_id || projectId
      });
    } else {
      const normalizedPrivateKey = privateKeyRaw.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: normalizedPrivateKey
        }),
        projectId
      });
    }
  }

  return firestoreDatabaseId && firestoreDatabaseId !== '(default)'
    ? getFirestore(adminApp, firestoreDatabaseId)
    : getFirestore(adminApp);
}

let defaultStoreInstance: PersistenceAdapter | null = null;

/**
 * Creates or returns the active server persistence adapter:
 * - Uses `FirestoreAdminPersistenceAdapter` on Vercel / production when Firebase Admin
 *   service-account credentials are set.
 * - Falls back to `TransactionalStoreAdapter` in local development / automated tests
 *   when service-account credentials are not present.
 */
export function getDefaultPersistenceAdapter(): PersistenceAdapter {
  if (!defaultStoreInstance) {
    const adminDb = getFirebaseAdminFirestoreIfConfigured();
    if (adminDb) {
      defaultStoreInstance = new FirestoreAdminPersistenceAdapter(adminDb);
    } else {
      defaultStoreInstance = new TransactionalStoreAdapter({
        snapshotFilePath: process.env.PERSISTENT_STORE_FILE_PATH || undefined
      });
    }
  }
  return defaultStoreInstance;
}
