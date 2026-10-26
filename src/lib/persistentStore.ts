import crypto from 'node:crypto';
import fs from 'node:fs';
import { getApps, initializeApp, cert, type App as AdminApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  calculateOrderTotals,
  validateOrderStateTransition,
  type Product,
  type SizeVariant,
  type KitVisualSpec,
  type CouponDefinition,
  type SiteSettingsConfig,
  type PricedOrderItem,
  type PaymentMethod,
  type PaymentStatus,
  type OrderStatus,
  type JerseySize,
  type JerseyCategory,
  type KitType,
  type EditionTier,
  type GenderFit,
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

export interface StockAdjustmentLog {
  id: string;
  productId: string;
  productName: string;
  size: JerseySize;
  previousStock: number;
  newStock: number;
  delta: number;
  reason: string;
  actorUid: string;
  actorEmail: string;
  timestamp: string;
}

export interface CustomerDirectoryRecord {
  customerKey: string;
  uid: string | null;
  name: string;
  email: string;
  phone: string;
  division: string;
  district: string;
  upazila: string;
  streetAddress: string;
  isRegisteredUser: boolean;
  totalOrders: number;
  totalSpentBdt: number;
  lastOrderAt: string | null;
  orders: Array<Omit<StoredOrder, 'orderAccessToken' | 'idempotencyKey'>>;
}

export interface UpsertProductInput {
  id?: string;
  slug?: string;
  name: string;
  team: string;
  countryOrLeague?: string;
  category: JerseyCategory;
  kitType: KitType;
  editionTier: EditionTier;
  gender?: GenderFit;
  season?: string;
  priceBdt: number;
  salePriceBdt?: number | null;
  customPrintPriceBdt?: number;
  description: string;
  fabricSpec?: string;
  fitNote?: string;
  careInstructions?: string;
  isActive?: boolean;
  isDemo?: boolean;
  featuredRank?: number;
  imageUrls?: string[];
  variants?: Array<{
    size: JerseySize;
    sku?: string;
    priceBdt?: number;
    stock: number;
    isActive?: boolean;
    chestInches?: string;
    lengthInches?: string;
  }>;
  visual?: Partial<KitVisualSpec>;
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

export type SiteSettingsPatch = Partial<
  Pick<
    SiteSettingsConfig,
    | 'announcementText'
    | 'insideDhakaShippingBdt'
    | 'outsideDhakaShippingBdt'
    | 'freeShippingThresholdBdt'
    | 'returnWindowDays'
    | 'supportPhone'
    | 'supportEmail'
    | 'storeAddress'
  >
>;

export interface PersistenceAdapter {
  readonly backendType: 'firestore-admin' | 'transactional-store' | 'unconfigured-production';
  getCatalogAndSettings(options?: {
    includeAllCoupons?: boolean;
  }): Promise<{
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
    reason?: string;
    actorUid?: string;
    actorEmail?: string;
  }): Promise<Product>;
  createProductAtomic(input: UpsertProductInput): Promise<Product>;
  updateProductAtomic(productId: string, input: Partial<UpsertProductInput>): Promise<Product>;
  setProductArchiveStateAtomic(productId: string, isActive: boolean): Promise<Product>;
  listStockAdjustmentLogs(limit?: number): Promise<StockAdjustmentLog[]>;
  upsertCouponAtomic(coupon: CouponDefinition): Promise<CouponDefinition>;
  deleteCouponAtomic(code: string): Promise<void>;
  listCustomerDirectory(): Promise<CustomerDirectoryRecord[]>;
  updateSiteSettingsAtomic(patch: SiteSettingsPatch): Promise<SiteSettingsConfig>;
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
    ...INITIAL_SITE_SETTINGS,
    ...settings,
    bkashMerchantEnabled: isBkashConfiguredFromEnv(),
    nagadMerchantEnabled: isNagadConfiguredFromEnv()
  };
}

const ALL_JERSEY_SIZES: JerseySize[] = ['S', 'M', 'L', 'XL', 'XXL'];
const DEFAULT_SIZE_MEASUREMENTS: Record<JerseySize, { chestInches: string; lengthInches: string }> =
  {
    S: { chestInches: '37–38"', lengthInches: '27"' },
    M: { chestInches: '39–40"', lengthInches: '28"' },
    L: { chestInches: '41–42"', lengthInches: '29"' },
    XL: { chestInches: '43–44"', lengthInches: '30"' },
    XXL: { chestInches: '45–46"', lengthInches: '31"' }
  };

const VALID_CATEGORIES: JerseyCategory[] = ['national', 'club', 'retro'];
const VALID_KIT_TYPES: KitType[] = ['Home', 'Away', 'Third', 'Retro', 'Special'];
const VALID_EDITION_TIERS: EditionTier[] = [
  'Fan Replica',
  'Player Fit Replica',
  'Heritage Retro Replica'
];
const VALID_GENDERS: GenderFit[] = ['Men', 'Women', 'Kids', 'Unisex'];
const VALID_PATTERNS: KitVisualSpec['pattern'][] = [
  'stripes',
  'solid',
  'halves',
  'pinstripe',
  'hoops',
  'sash'
];
const VALID_COLLARS: KitVisualSpec['collarStyle'][] = ['crew', 'v-neck', 'polo'];

function slugifyProductName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function validateImageUrls(rawUrls: unknown): string[] {
  if (!Array.isArray(rawUrls)) return [];
  const cleaned: string[] = [];
  for (const item of rawUrls) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (
      !trimmed.startsWith('https://') &&
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('data:image/')
    ) {
      throw new StoreError(
        400,
        'Product image URLs must start with https:// or be a valid uploaded image.'
      );
    }
    if (trimmed.length > 250_000) {
      throw new StoreError(400, 'Product image URL or inline payload exceeds maximum size.');
    }
    cleaned.push(trimmed);
  }
  if (cleaned.length > 6) {
    throw new StoreError(400, 'A product can have at most 6 gallery images.');
  }
  return cleaned;
}

function validateAndBuildProduct(
  input: UpsertProductInput,
  existingProduct?: Product
): Product {
  const nowIso = new Date().toISOString();
  const name = String(input.name ?? existingProduct?.name ?? '').trim();
  if (name.length < 3 || name.length > 120) {
    throw new StoreError(400, 'Product name must be between 3 and 120 characters.');
  }

  const team = String(input.team ?? existingProduct?.team ?? '').trim();
  if (team.length < 2 || team.length > 60) {
    throw new StoreError(400, 'Team name must be between 2 and 60 characters.');
  }

  const category = (input.category ?? existingProduct?.category ?? 'club') as JerseyCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    throw new StoreError(400, 'Invalid jersey category. Must be national, club, or retro.');
  }

  const kitType = (input.kitType ?? existingProduct?.kitType ?? 'Home') as KitType;
  if (!VALID_KIT_TYPES.includes(kitType)) {
    throw new StoreError(400, 'Invalid kit type. Must be Home, Away, Third, Retro, or Special.');
  }

  const editionTier = (input.editionTier ??
    existingProduct?.editionTier ??
    'Fan Replica') as EditionTier;
  if (!VALID_EDITION_TIERS.includes(editionTier)) {
    throw new StoreError(
      400,
      'Invalid edition tier. Must be Fan Replica, Player Fit Replica, or Heritage Retro Replica.'
    );
  }

  const gender = (input.gender ?? existingProduct?.gender ?? 'Unisex') as GenderFit;
  if (!VALID_GENDERS.includes(gender)) {
    throw new StoreError(400, 'Invalid gender fit.');
  }

  const priceBdt = Number(input.priceBdt ?? existingProduct?.priceBdt ?? 0);
  if (!Number.isFinite(priceBdt) || priceBdt < 300 || priceBdt > 25000) {
    throw new StoreError(400, 'Regular price must be between ৳300 and ৳25,000.');
  }
  const roundedPriceBdt = Math.round(priceBdt);

  let roundedSalePriceBdt: number | null = null;
  const rawSale =
    input.salePriceBdt !== undefined ? input.salePriceBdt : existingProduct?.salePriceBdt;
  if (rawSale !== null && rawSale !== undefined && String(rawSale).trim() !== '') {
    const numSale = Number(rawSale);
    if (!Number.isFinite(numSale) || numSale < 200 || numSale >= roundedPriceBdt) {
      throw new StoreError(
        400,
        `Sale price must be at least ৳200 and strictly less than the regular price (৳${roundedPriceBdt}).`
      );
    }
    roundedSalePriceBdt = Math.round(numSale);
  }

  const customPrintPriceBdt = Number(
    input.customPrintPriceBdt ?? existingProduct?.customPrintPriceBdt ?? 350
  );
  if (
    !Number.isFinite(customPrintPriceBdt) ||
    customPrintPriceBdt < 0 ||
    customPrintPriceBdt > 5000
  ) {
    throw new StoreError(400, 'Custom printing fee must be between ৳0 and ৳5,000.');
  }

  const description = String(input.description ?? existingProduct?.description ?? '').trim();
  if (description.length < 10 || description.length > 1500) {
    throw new StoreError(400, 'Product description must be between 10 and 1,500 characters.');
  }

  const slug = slugifyProductName(input.slug || existingProduct?.slug || name);
  if (!slug || slug.length < 3) {
    throw new StoreError(400, 'A valid URL slug is required.');
  }

  const id =
    existingProduct?.id ||
    (input.id && /^[a-z0-9-]+$/.test(input.id.trim())
      ? input.id.trim()
      : `${slug.slice(0, 32)}-${crypto.randomBytes(2).toString('hex')}`);

  const crestCode = String(
    input.visual?.crestCode ??
      existingProduct?.visual?.crestCode ??
      team.slice(0, 3).toUpperCase()
  )
    .trim()
    .toUpperCase()
    .slice(0, 4);

  const primaryColor = String(
    input.visual?.primaryColor ?? existingProduct?.visual?.primaryColor ?? '#111111'
  ).trim();
  const secondaryColor = String(
    input.visual?.secondaryColor ?? existingProduct?.visual?.secondaryColor ?? '#FFFFFF'
  ).trim();
  const accentColor = String(
    input.visual?.accentColor ?? existingProduct?.visual?.accentColor ?? '#15803D'
  ).trim();
  const textColor = String(
    input.visual?.textColor ?? existingProduct?.visual?.textColor ?? '#FFFFFF'
  ).trim();

  const pattern = (input.visual?.pattern ??
    existingProduct?.visual?.pattern ??
    'solid') as KitVisualSpec['pattern'];
  const collarStyle = (input.visual?.collarStyle ??
    existingProduct?.visual?.collarStyle ??
    'crew') as KitVisualSpec['collarStyle'];

  const visual: KitVisualSpec = {
    primaryColor: /^#[0-9A-Fa-f]{3,8}$/.test(primaryColor) ? primaryColor : '#111111',
    secondaryColor: /^#[0-9A-Fa-f]{3,8}$/.test(secondaryColor) ? secondaryColor : '#FFFFFF',
    accentColor: /^#[0-9A-Fa-f]{3,8}$/.test(accentColor) ? accentColor : '#15803D',
    textColor: /^#[0-9A-Fa-f]{3,8}$/.test(textColor) ? textColor : '#FFFFFF',
    pattern: VALID_PATTERNS.includes(pattern) ? pattern : 'solid',
    collarStyle: VALID_COLLARS.includes(collarStyle) ? collarStyle : 'crew',
    crestCode: crestCode || 'JVY',
    defaultPreviewName: String(
      input.visual?.defaultPreviewName ?? existingProduct?.visual?.defaultPreviewName ?? 'SUPPORTER'
    )
      .trim()
      .toUpperCase()
      .slice(0, 12),
    defaultPreviewNumber: String(
      input.visual?.defaultPreviewNumber ?? existingProduct?.visual?.defaultPreviewNumber ?? '10'
    )
      .trim()
      .slice(0, 2)
  };

  const variants: SizeVariant[] = ALL_JERSEY_SIZES.map((size) => {
    const incomingVar = input.variants?.find((v) => v.size === size);
    const existingVar = existingProduct?.variants.find((v) => v.size === size);
    const rawStock = incomingVar?.stock ?? existingVar?.stock ?? 10;
    if (!Number.isFinite(rawStock) || rawStock < 0 || rawStock > 5000) {
      throw new StoreError(400, `Stock for size ${size} must be between 0 and 5000.`);
    }
    return {
      size,
      sku:
        incomingVar?.sku?.trim() ||
        existingVar?.sku ||
        `JV-${crestCode || 'KIT'}-${id.slice(0, 4).toUpperCase()}-${size}`,
      priceBdt: roundedPriceBdt,
      stock: Math.floor(rawStock),
      isActive: incomingVar?.isActive ?? existingVar?.isActive ?? true,
      chestInches:
        incomingVar?.chestInches ||
        existingVar?.chestInches ||
        DEFAULT_SIZE_MEASUREMENTS[size].chestInches,
      lengthInches:
        incomingVar?.lengthInches ||
        existingVar?.lengthInches ||
        DEFAULT_SIZE_MEASUREMENTS[size].lengthInches
    };
  });

  const imageUrls =
    input.imageUrls !== undefined
      ? validateImageUrls(input.imageUrls)
      : existingProduct?.imageUrls || [];

  return {
    id,
    slug,
    name,
    team,
    countryOrLeague:
      String(
        input.countryOrLeague ?? existingProduct?.countryOrLeague ?? 'International / Club'
      )
        .trim()
        .slice(0, 80) || 'International / Club',
    category,
    kitType,
    editionTier,
    gender,
    season: String(input.season ?? existingProduct?.season ?? '2025/26').trim().slice(0, 20),
    priceBdt: roundedPriceBdt,
    salePriceBdt: roundedSalePriceBdt,
    customPrintPriceBdt: Math.round(customPrintPriceBdt),
    description,
    fabricSpec:
      String(
        input.fabricSpec ??
          existingProduct?.fabricSpec ??
          '165 GSM AeroMesh 100% Breathable Polyester · Embroidered Crest'
      )
        .trim()
        .slice(0, 200),
    fitNote:
      String(
        input.fitNote ??
          existingProduct?.fitNote ??
          'Standard Bangladesh stadium fit. True to chest sizing chart.'
      )
        .trim()
        .slice(0, 200),
    careInstructions:
      String(
        input.careInstructions ??
          existingProduct?.careInstructions ??
          'Machine wash cold inside-out. Do not iron directly over print.'
      )
        .trim()
        .slice(0, 200),
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : (existingProduct?.isActive ?? true),
    isDemo: existingProduct ? existingProduct.isDemo : Boolean(input.isDemo ?? false),
    featuredRank: Number.isFinite(Number(input.featuredRank))
      ? Number(input.featuredRank)
      : (existingProduct?.featuredRank ?? 99),
    createdAt: existingProduct?.createdAt ?? nowIso,
    updatedAt: nowIso,
    variants,
    visual,
    imageUrls
  };
}

function validateCouponInput(input: CouponDefinition): CouponDefinition {
  const code = String(input.code ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
    throw new StoreError(
      400,
      'Coupon code must be 3–20 uppercase alphanumeric characters (e.g., EID200).'
    );
  }
  const description = String(input.description ?? '').trim();
  if (description.length < 4 || description.length > 160) {
    throw new StoreError(400, 'Coupon description must be between 4 and 160 characters.');
  }
  const discountType = input.discountType;
  if (discountType !== 'PERCENTAGE' && discountType !== 'FIXED_BDT') {
    throw new StoreError(400, 'Discount type must be PERCENTAGE or FIXED_BDT.');
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new StoreError(400, 'Discount value must be greater than 0.');
  }
  if (discountType === 'PERCENTAGE' && (value < 1 || value > 90)) {
    throw new StoreError(400, 'Percentage discount must be between 1% and 90%.');
  }
  if (discountType === 'FIXED_BDT' && (value < 10 || value > 10000)) {
    throw new StoreError(400, 'Fixed BDT discount must be between ৳10 and ৳10,000.');
  }
  const minSubtotalBdt = Number(input.minSubtotalBdt ?? 0);
  if (!Number.isFinite(minSubtotalBdt) || minSubtotalBdt < 0 || minSubtotalBdt > 100000) {
    throw new StoreError(400, 'Minimum subtotal must be between ৳0 and ৳100,000.');
  }
  let maxDiscountBdt: number | undefined = undefined;
  if (
    input.maxDiscountBdt !== undefined &&
    input.maxDiscountBdt !== null &&
    String(input.maxDiscountBdt).trim() !== ''
  ) {
    const maxVal = Number(input.maxDiscountBdt);
    if (!Number.isFinite(maxVal) || maxVal < 10 || maxVal > 25000) {
      throw new StoreError(400, 'Maximum discount cap must be between ৳10 and ৳25,000.');
    }
    maxDiscountBdt = Math.round(maxVal);
  }

  return {
    code,
    description,
    discountType,
    value: Math.round(value),
    minSubtotalBdt: Math.round(minSubtotalBdt),
    ...(maxDiscountBdt !== undefined ? { maxDiscountBdt } : {}),
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : true
  };
}

function applySiteSettingsPatch(
  current: SiteSettingsConfig,
  patch: SiteSettingsPatch
): SiteSettingsConfig {
  const nextSettings = structuredClone(current);

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
      throw new StoreError(400, 'Free shipping threshold must be between ৳0 and ৳50,000.');
    }
    nextSettings.freeShippingThresholdBdt = Math.round(patch.freeShippingThresholdBdt);
  }
  if (typeof patch.returnWindowDays === 'number') {
    if (
      !Number.isFinite(patch.returnWindowDays) ||
      patch.returnWindowDays < 1 ||
      patch.returnWindowDays > 90
    ) {
      throw new StoreError(400, 'Return window must be between 1 and 90 days.');
    }
    nextSettings.returnWindowDays = Math.round(patch.returnWindowDays);
  }
  if (typeof patch.supportPhone === 'string') {
    const cleanPhone = patch.supportPhone.trim();
    if (cleanPhone.length < 6 || cleanPhone.length > 30) {
      throw new StoreError(400, 'Support phone must be between 6 and 30 characters.');
    }
    nextSettings.supportPhone = cleanPhone;
  }
  if (typeof patch.supportEmail === 'string') {
    const cleanEmail = patch.supportEmail.trim();
    if (cleanEmail.length < 5 || cleanEmail.length > 120 || !cleanEmail.includes('@')) {
      throw new StoreError(400, 'Please provide a valid support email address.');
    }
    nextSettings.supportEmail = cleanEmail;
  }
  if (typeof patch.storeAddress === 'string') {
    const cleanAddr = patch.storeAddress.trim();
    if (cleanAddr.length < 5 || cleanAddr.length > 200) {
      throw new StoreError(400, 'Store address must be between 5 and 200 characters.');
    }
    nextSettings.storeAddress = cleanAddr;
  }

  nextSettings.updatedAt = new Date().toISOString();
  return withEnvGatewayFlags(nextSettings);
}

function buildCustomerDirectoryFromOrders(
  orders: StoredOrder[],
  registeredProfiles: Array<{
    uid: string;
    displayName?: string;
    email?: string;
    phone?: string;
    division?: string;
    district?: string;
    upazila?: string;
    streetAddress?: string;
  }> = []
): CustomerDirectoryRecord[] {
  const map = new Map<string, CustomerDirectoryRecord>();

  for (const prof of registeredProfiles) {
    if (!prof.uid) continue;
    const key = `uid:${prof.uid}`;
    map.set(key, {
      customerKey: key,
      uid: prof.uid,
      name: prof.displayName || 'Registered Supporter',
      email: prof.email || '',
      phone: prof.phone || '',
      division: prof.division || 'Dhaka',
      district: prof.district || 'Dhaka',
      upazila: prof.upazila || '',
      streetAddress: prof.streetAddress || '',
      isRegisteredUser: true,
      totalOrders: 0,
      totalSpentBdt: 0,
      lastOrderAt: null,
      orders: []
    });
  }

  const realOrders = orders
    .filter((o) => !o.isDemoOrder)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const ord of realOrders) {
    const key = ord.userId ? `uid:${ord.userId}` : `phone:${ord.customerPhone}`;
    const { orderAccessToken: _t, idempotencyKey: _i, ...safeOrder } = structuredClone(ord);
    let entry = map.get(key);
    if (!entry) {
      entry = {
        customerKey: key,
        uid: ord.userId || null,
        name: ord.customerName,
        email: ord.customerEmail || '',
        phone: ord.customerPhone,
        division: ord.division,
        district: ord.district,
        upazila: ord.upazila,
        streetAddress: ord.streetAddress,
        isRegisteredUser: Boolean(ord.userId),
        totalOrders: 0,
        totalSpentBdt: 0,
        lastOrderAt: null,
        orders: []
      };
      map.set(key, entry);
    } else {
      if (!entry.phone && ord.customerPhone) entry.phone = ord.customerPhone;
      if (!entry.email && ord.customerEmail) entry.email = ord.customerEmail;
      if (!entry.streetAddress && ord.streetAddress) {
        entry.division = ord.division;
        entry.district = ord.district;
        entry.upazila = ord.upazila;
        entry.streetAddress = ord.streetAddress;
      }
    }

    entry.totalOrders += 1;
    if (ord.orderStatus !== 'CANCELLED') {
      entry.totalSpentBdt += ord.totalBdt;
    }
    if (!entry.lastOrderAt || ord.createdAt > entry.lastOrderAt) {
      entry.lastOrderAt = ord.createdAt;
    }
    entry.orders.push(safeOrder);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.lastOrderAt && b.lastOrderAt) return b.lastOrderAt.localeCompare(a.lastOrderAt);
    if (a.lastOrderAt) return -1;
    if (b.lastOrderAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Concurrency-safe transactional store with an async mutex lock and optional JSON file persistence.
 */
export class TransactionalStoreAdapter implements PersistenceAdapter {
  public readonly backendType = 'transactional-store' as const;
  private catalog: Product[];
  private coupons: CouponDefinition[];
  private settings: SiteSettingsConfig;
  private orders: Map<string, StoredOrder>;
  private idempotencyIndex: Map<string, string>;
  private stockLogs: StockAdjustmentLog[];
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
    this.stockLogs = [];

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
        coupons?: CouponDefinition[];
        settings?: SiteSettingsConfig;
        orders?: StoredOrder[];
        stockLogs?: StockAdjustmentLog[];
      };
      if (Array.isArray(parsed.catalog) && parsed.catalog.length > 0) {
        this.catalog = parsed.catalog;
      }
      if (Array.isArray(parsed.coupons) && parsed.coupons.length > 0) {
        this.coupons = parsed.coupons;
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
      if (Array.isArray(parsed.stockLogs)) {
        this.stockLogs = parsed.stockLogs;
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
        coupons: this.coupons,
        settings: this.settings,
        orders: Array.from(this.orders.values()),
        stockLogs: this.stockLogs
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

  async getCatalogAndSettings(options?: { includeAllCoupons?: boolean }) {
    this.loadSnapshotFromDisk();
    this.settings = withEnvGatewayFlags(this.settings);
    return {
      products: structuredClone(this.catalog),
      coupons: structuredClone(
        options?.includeAllCoupons ? this.coupons : this.coupons.filter((c) => c.isActive)
      ),
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
          calculation.error?.includes('Stock changed') ||
          calculation.error?.includes('Insufficient stock');
        throw new StoreError(
          isStockError ? 409 : 400,
          calculation.error ?? 'Order calculation failed.'
        );
      }

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
            const prevStock = variant.stock;
            variant.stock += item.quantity;
            product.updatedAt = nowIso;
            this.stockLogs.unshift({
              id: `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
              productId: product.id,
              productName: product.name,
              size: variant.size,
              previousStock: prevStock,
              newStock: variant.stock,
              delta: item.quantity,
              reason: `Stock restored from cancelled order ${existing.orderNumber}`,
              actorUid: actorRole,
              actorEmail: actorRole,
              timestamp: nowIso
            });
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
              'Order cancelled prior to dispatch confirmation. Reserved stock restored to inventory.'
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
            const prevStock = variant.stock;
            variant.stock += item.quantity;
            product.updatedAt = nowIso;
            this.stockLogs.unshift({
              id: `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
              productId: product.id,
              productName: product.name,
              size: variant.size,
              previousStock: prevStock,
              newStock: variant.stock,
              delta: item.quantity,
              reason: `Stock restored on admin cancellation of ${existing.orderNumber}`,
              actorUid: 'admin',
              actorEmail: 'admin',
              timestamp: nowIso
            });
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
    reason?: string;
    actorUid?: string;
    actorEmail?: string;
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

      const previousStock = variant.stock;
      const nowIso = new Date().toISOString();

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

      if (variant.stock !== previousStock) {
        this.stockLogs.unshift({
          id: `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
          productId: product.id,
          productName: product.name,
          size: variant.size,
          previousStock,
          newStock: variant.stock,
          delta: variant.stock - previousStock,
          reason: (params.reason || 'Manual admin inventory adjustment').trim().slice(0, 160),
          actorUid: params.actorUid || 'admin',
          actorEmail: params.actorEmail || 'admin',
          timestamp: nowIso
        });
      }

      product.updatedAt = nowIso;
      this.catalog = nextCatalog;
      this.persistSnapshotToDisk();
      return structuredClone(product);
    });
  }

  async createProductAtomic(input: UpsertProductInput): Promise<Product> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const newProduct = validateAndBuildProduct(input);
      if (this.catalog.some((p) => p.id === newProduct.id || p.slug === newProduct.slug)) {
        throw new StoreError(
          409,
          `A product with ID "${newProduct.id}" or slug "${newProduct.slug}" already exists.`
        );
      }
      this.catalog.push(newProduct);
      this.persistSnapshotToDisk();
      return structuredClone(newProduct);
    });
  }

  async updateProductAtomic(
    productId: string,
    input: Partial<UpsertProductInput>
  ): Promise<Product> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const index = this.catalog.findIndex((p) => p.id === productId);
      if (index === -1) {
        throw new StoreError(404, `Product "${productId}" not found.`);
      }
      const existing = this.catalog[index]!;
      const updated = validateAndBuildProduct(
        {
          ...existing,
          ...input,
          name: input.name ?? existing.name,
          team: input.team ?? existing.team,
          category: input.category ?? existing.category,
          kitType: input.kitType ?? existing.kitType,
          editionTier: input.editionTier ?? existing.editionTier,
          priceBdt: input.priceBdt ?? existing.priceBdt,
          description: input.description ?? existing.description,
          visual: { ...existing.visual, ...(input.visual || {}) }
        },
        existing
      );

      if (
        this.catalog.some((p, idx) => idx !== index && p.slug === updated.slug)
      ) {
        throw new StoreError(409, `Another product already uses the slug "${updated.slug}".`);
      }

      this.catalog[index] = updated;
      this.persistSnapshotToDisk();
      return structuredClone(updated);
    });
  }

  async setProductArchiveStateAtomic(productId: string, isActive: boolean): Promise<Product> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const product = this.catalog.find((p) => p.id === productId);
      if (!product) {
        throw new StoreError(404, `Product "${productId}" not found.`);
      }
      product.isActive = Boolean(isActive);
      product.updatedAt = new Date().toISOString();
      this.persistSnapshotToDisk();
      return structuredClone(product);
    });
  }

  async listStockAdjustmentLogs(limit = 50): Promise<StockAdjustmentLog[]> {
    this.loadSnapshotFromDisk();
    return structuredClone(this.stockLogs.slice(0, limit));
  }

  async upsertCouponAtomic(couponInput: CouponDefinition): Promise<CouponDefinition> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const validated = validateCouponInput(couponInput);
      const existingIdx = this.coupons.findIndex((c) => c.code === validated.code);
      if (existingIdx >= 0) {
        this.coupons[existingIdx] = validated;
      } else {
        this.coupons.push(validated);
      }
      this.persistSnapshotToDisk();
      return structuredClone(validated);
    });
  }

  async deleteCouponAtomic(code: string): Promise<void> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      const cleanCode = String(code ?? '').trim().toUpperCase();
      const existingIdx = this.coupons.findIndex((c) => c.code === cleanCode);
      if (existingIdx === -1) {
        throw new StoreError(404, `Coupon "${cleanCode}" not found.`);
      }
      this.coupons.splice(existingIdx, 1);
      this.persistSnapshotToDisk();
    });
  }

  async listCustomerDirectory(): Promise<CustomerDirectoryRecord[]> {
    this.loadSnapshotFromDisk();
    return buildCustomerDirectoryFromOrders(Array.from(this.orders.values()));
  }

  async updateSiteSettingsAtomic(patch: SiteSettingsPatch): Promise<SiteSettingsConfig> {
    return this.runExclusive(async () => {
      this.loadSnapshotFromDisk();
      this.settings = applySiteSettingsPatch(this.settings, patch);
      this.persistSnapshotToDisk();
      return structuredClone(this.settings);
    });
  }
}

/**
 * Cloud Firestore Admin SDK Persistence Adapter for production Vercel Serverless deployments.
 * Uses Firestore multi-document transactions (`db.runTransaction`) to atomically persist
 * orders, idempotency locks, catalog products, variant inventory, stock logs, coupons, and settings.
 */
export class FirestoreAdminPersistenceAdapter implements PersistenceAdapter {
  public readonly backendType = 'firestore-admin' as const;
  private readonly db: Firestore;
  private seededPromise: Promise<void> | null = null;

  constructor(db: Firestore) {
    this.db = db;
  }

  private async ensureSeeded(): Promise<void> {
    if (!this.seededPromise) {
      this.seededPromise = (async () => {
        try {
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
            for (const coup of INITIAL_COUPONS) {
              batch.set(this.db.collection('serverCoupons').doc(coup.code), structuredClone(coup));
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
        } catch (seedErr) {
          this.seededPromise = null;
          throw seedErr;
        }
      })();
    }
    return this.seededPromise;
  }

  async getCatalogAndSettings(options?: { includeAllCoupons?: boolean }): Promise<{
    products: Product[];
    coupons: CouponDefinition[];
    settings: SiteSettingsConfig;
  }> {
    await this.ensureSeeded();
    const [catalogSnap, couponsSnap, settingsSnap] = await Promise.all([
      this.db.collection('serverCatalog').get(),
      this.db.collection('serverCoupons').get(),
      this.db.collection('siteSettings').doc('global').get()
    ]);

    const products: Product[] = catalogSnap.docs
      .map((d) => d.data() as Product)
      .sort((a, b) => a.featuredRank - b.featuredRank);

    const storedCoupons: CouponDefinition[] =
      couponsSnap && !couponsSnap.empty
        ? couponsSnap.docs.map((d) => d.data() as CouponDefinition)
        : structuredClone(INITIAL_COUPONS);

    const rawSettings = settingsSnap.exists
      ? (settingsSnap.data() as SiteSettingsConfig)
      : structuredClone(INITIAL_SITE_SETTINGS);

    return {
      products: products.length > 0 ? products : structuredClone(INITIAL_CATALOG),
      coupons: options?.includeAllCoupons
        ? storedCoupons
        : storedCoupons.filter((c) => c.isActive),
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

    const couponsSnap = await this.db.collection('serverCoupons').get();
    const activeCoupons: CouponDefinition[] =
      couponsSnap && !couponsSnap.empty
        ? couponsSnap.docs.map((d) => d.data() as CouponDefinition)
        : structuredClone(INITIAL_COUPONS);

    return this.db.runTransaction(async (tx: Transaction) => {
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

      const calculation = calculateOrderTotals({
        items: input.items,
        catalog: lockedCatalog,
        coupons: activeCoupons,
        settings,
        couponCode: input.couponCode,
        division: input.division,
        district: input.district
      });

      if (!calculation.valid) {
        const isStockError =
          calculation.error?.includes('Only ') ||
          calculation.error?.includes('out of stock') ||
          calculation.error?.includes('Stock changed') ||
          calculation.error?.includes('Insufficient stock');
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
              const prevStock = variant.stock;
              variant.stock += item.quantity;
              const logId = `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
              tx.set(this.db.collection('serverStockLogs').doc(logId), {
                id: logId,
                productId: prod.id,
                productName: prod.name,
                size: variant.size,
                previousStock: prevStock,
                newStock: variant.stock,
                delta: item.quantity,
                reason: `Stock restored from cancelled order ${existing.orderNumber}`,
                actorUid: actorRole,
                actorEmail: actorRole,
                timestamp: nowIso
              });
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
              'Order cancelled prior to dispatch confirmation. Reserved stock restored to inventory.'
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
              const prevStock = variant.stock;
              variant.stock += item.quantity;
              const logId = `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
              tx.set(this.db.collection('serverStockLogs').doc(logId), {
                id: logId,
                productId: prod.id,
                productName: prod.name,
                size: variant.size,
                previousStock: prevStock,
                newStock: variant.stock,
                delta: item.quantity,
                reason: `Stock restored on admin cancellation of ${existing.orderNumber}`,
                actorUid: 'admin',
                actorEmail: 'admin',
                timestamp: nowIso
              });
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
    reason?: string;
    actorUid?: string;
    actorEmail?: string;
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

      const previousStock = variant.stock;
      const nowIso = new Date().toISOString();

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

      if (variant.stock !== previousStock) {
        const logId = `stk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        const logEntry: StockAdjustmentLog = {
          id: logId,
          productId: product.id,
          productName: product.name,
          size: variant.size,
          previousStock,
          newStock: variant.stock,
          delta: variant.stock - previousStock,
          reason: (params.reason || 'Manual admin inventory adjustment').trim().slice(0, 160),
          actorUid: params.actorUid || 'admin',
          actorEmail: params.actorEmail || 'admin',
          timestamp: nowIso
        };
        tx.set(this.db.collection('serverStockLogs').doc(logId), logEntry);
      }

      product.updatedAt = nowIso;
      tx.set(prodRef, product);
      return product;
    });
  }

  async createProductAtomic(input: UpsertProductInput): Promise<Product> {
    await this.ensureSeeded();
    const newProduct = validateAndBuildProduct(input);
    const catalogSnap = await this.db.collection('serverCatalog').get();
    const existingProducts = catalogSnap.docs.map((d) => d.data() as Product);
    if (existingProducts.some((p) => p.id === newProduct.id || p.slug === newProduct.slug)) {
      throw new StoreError(
        409,
        `A product with ID "${newProduct.id}" or slug "${newProduct.slug}" already exists.`
      );
    }

    return this.db.runTransaction(async (tx: Transaction) => {
      const prodRef = this.db.collection('serverCatalog').doc(newProduct.id);
      const snap = await tx.get(prodRef);
      if (snap.exists) {
        throw new StoreError(409, `Product "${newProduct.id}" already exists.`);
      }
      tx.set(prodRef, newProduct);
      return newProduct;
    });
  }

  async updateProductAtomic(
    productId: string,
    input: Partial<UpsertProductInput>
  ): Promise<Product> {
    await this.ensureSeeded();
    return this.db.runTransaction(async (tx: Transaction) => {
      const prodRef = this.db.collection('serverCatalog').doc(productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists) {
        throw new StoreError(404, `Product "${productId}" not found.`);
      }
      const existing = snap.data() as Product;
      const updated = validateAndBuildProduct(
        {
          ...existing,
          ...input,
          name: input.name ?? existing.name,
          team: input.team ?? existing.team,
          category: input.category ?? existing.category,
          kitType: input.kitType ?? existing.kitType,
          editionTier: input.editionTier ?? existing.editionTier,
          priceBdt: input.priceBdt ?? existing.priceBdt,
          description: input.description ?? existing.description,
          visual: { ...existing.visual, ...(input.visual || {}) }
        },
        existing
      );
      tx.set(prodRef, updated);
      return updated;
    });
  }

  async setProductArchiveStateAtomic(productId: string, isActive: boolean): Promise<Product> {
    await this.ensureSeeded();
    return this.db.runTransaction(async (tx: Transaction) => {
      const prodRef = this.db.collection('serverCatalog').doc(productId);
      const snap = await tx.get(prodRef);
      if (!snap.exists) {
        throw new StoreError(404, `Product "${productId}" not found.`);
      }
      const existing = structuredClone(snap.data() as Product);
      existing.isActive = Boolean(isActive);
      existing.updatedAt = new Date().toISOString();
      tx.set(prodRef, existing);
      return existing;
    });
  }

  async listStockAdjustmentLogs(limit = 50): Promise<StockAdjustmentLog[]> {
    await this.ensureSeeded();
    const snap = await this.db.collection('serverStockLogs').get();
    return snap.docs
      .map((d) => d.data() as StockAdjustmentLog)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async upsertCouponAtomic(couponInput: CouponDefinition): Promise<CouponDefinition> {
    await this.ensureSeeded();
    const validated = validateCouponInput(couponInput);
    return this.db.runTransaction(async (tx: Transaction) => {
      const coupRef = this.db.collection('serverCoupons').doc(validated.code);
      tx.set(coupRef, validated);
      return validated;
    });
  }

  async deleteCouponAtomic(code: string): Promise<void> {
    await this.ensureSeeded();
    const cleanCode = String(code ?? '').trim().toUpperCase();
    return this.db.runTransaction(async (tx: Transaction) => {
      const coupRef = this.db.collection('serverCoupons').doc(cleanCode);
      const snap = await tx.get(coupRef);
      if (!snap.exists) {
        throw new StoreError(404, `Coupon "${cleanCode}" not found.`);
      }
      const deactivated: CouponDefinition = {
        ...(snap.data() as CouponDefinition),
        isActive: false
      };
      tx.set(coupRef, deactivated);
    });
  }

  async listCustomerDirectory(): Promise<CustomerDirectoryRecord[]> {
    await this.ensureSeeded();
    const [ordersSnap, usersSnap] = await Promise.all([
      this.db.collection('serverOrders').get(),
      this.db.collection('users').get()
    ]);

    const orders = ordersSnap.docs.map((d) => d.data() as StoredOrder);
    const profiles = usersSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        uid: String(data.uid || d.id),
        displayName: typeof data.displayName === 'string' ? data.displayName : undefined
      };
    });

    return buildCustomerDirectoryFromOrders(orders, profiles);
  }

  async updateSiteSettingsAtomic(patch: SiteSettingsPatch): Promise<SiteSettingsConfig> {
    await this.ensureSeeded();
    return this.db.runTransaction(async (tx: Transaction) => {
      const settingsRef = this.db.collection('siteSettings').doc('global');
      const settingsSnap = await tx.get(settingsRef);
      const currentSettings = settingsSnap.exists
        ? structuredClone(settingsSnap.data() as SiteSettingsConfig)
        : structuredClone(INITIAL_SITE_SETTINGS);

      const finalSettings = applySiteSettingsPatch(currentSettings, patch);
      tx.set(settingsRef, finalSettings);
      return finalSettings;
    });
  }
}

export function loadProjectAndDbConfig(
  env: NodeJS.ProcessEnv = process.env
): { projectId: string; firestoreDatabaseId: string } {
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

export function isProductionServerEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  const vercelEnv = (env.VERCEL_ENV || '').trim().toLowerCase();
  const vercelFlag = (env.VERCEL || '').trim();
  return nodeEnv === 'production' || vercelEnv === 'production' || vercelFlag === '1';
}

export interface ProductionPersistenceConfigStatus {
  isProduction: boolean;
  configured: boolean;
  projectId: string;
  firestoreDatabaseId: string;
  missingVars: string[];
  reason?: string;
}

export function parseServiceAccountCredentials(raw: string): Record<string, unknown> {
  const sanitized = raw.trim().replace(/^["']|["']$/g, '').trim();
  let candidate = sanitized;
  if (!sanitized.startsWith('{')) {
    try {
      const decoded = Buffer.from(sanitized, 'base64').toString('utf-8').trim();
      if (decoded.startsWith('{')) {
        candidate = decoded;
      }
    } catch {
      // not base64
    }
  }
  return JSON.parse(candidate) as Record<string, unknown>;
}

export function parsePrivateKey(raw: string): string {
  const sanitized = raw.trim().replace(/^["']|["']$/g, '').trim();
  return sanitized.replace(/\\n/g, '\n');
}

export function getProductionPersistenceConfigStatus(
  env: NodeJS.ProcessEnv = process.env
): ProductionPersistenceConfigStatus {
  const { projectId, firestoreDatabaseId } = loadProjectAndDbConfig(env);
  const isProduction = isProductionServerEnvironment(env);
  const serviceAccountJsonRaw = (env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = (env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = (env.FIREBASE_PRIVATE_KEY || '').trim();

  const missingVars: string[] = [];
  if (!projectId) {
    missingVars.push('FIREBASE_PROJECT_ID');
  }

  const hasServiceAccountJson = Boolean(serviceAccountJsonRaw);
  const hasSplitCredentials = Boolean(clientEmail && privateKeyRaw);

  if (!hasServiceAccountJson && !hasSplitCredentials) {
    if (clientEmail && !privateKeyRaw) {
      missingVars.push('FIREBASE_PRIVATE_KEY');
    } else if (!clientEmail && privateKeyRaw) {
      missingVars.push('FIREBASE_CLIENT_EMAIL');
    } else {
      missingVars.push(
        'FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)'
      );
    }
  } else if (hasServiceAccountJson) {
    try {
      const parsed = parseServiceAccountCredentials(serviceAccountJsonRaw);
      if (
        typeof parsed.client_email !== 'string' ||
        typeof parsed.private_key !== 'string' ||
        !parsed.client_email.trim() ||
        !parsed.private_key.trim()
      ) {
        return {
          isProduction,
          configured: false,
          projectId,
          firestoreDatabaseId,
          missingVars: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
          reason:
            'Production persistence configuration error: FIREBASE_SERVICE_ACCOUNT_JSON is missing required "client_email" or "private_key" fields. Silent fallback to in-memory or local storage is disabled in production.'
        };
      }
    } catch {
      return {
        isProduction,
        configured: false,
        projectId,
        firestoreDatabaseId,
        missingVars: ['FIREBASE_SERVICE_ACCOUNT_JSON'],
        reason:
          'Production persistence configuration error: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON. Silent fallback to in-memory or local storage is disabled in production.'
      };
    }
  }

  if (missingVars.length > 0) {
    return {
      isProduction,
      configured: false,
      projectId,
      firestoreDatabaseId,
      missingVars,
      reason: `Production persistence configuration error: Cloud Firestore Admin credentials are required in production (${missingVars.join(', ')}). Configure FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) and FIREBASE_FIRESTORE_DATABASE_ID (or FIREBASE_DATABASE_ID) in server environment variables. Silent fallback to in-memory or local storage is disabled in production.`
    };
  }

  return {
    isProduction,
    configured: true,
    projectId,
    firestoreDatabaseId,
    missingVars: []
  };
}

/**
 * Fail-closed adapter used ONLY when running in production (`NODE_ENV=production` or `VERCEL=1`)
 * without valid Firebase Admin SDK credentials. Guarantees that production never silently
 * falls back to ephemeral in-memory or local disk storage, and instead returns a clear HTTP 503
 * server configuration error on any persistence operation.
 */
export class UnconfiguredProductionPersistenceAdapter implements PersistenceAdapter {
  public readonly backendType = 'unconfigured-production' as const;
  private readonly errorMessage: string;

  constructor(errorMessage?: string) {
    this.errorMessage =
      errorMessage ||
      'Production persistence configuration error: Cloud Firestore Admin credentials are required in production (set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, along with FIREBASE_FIRESTORE_DATABASE_ID / FIREBASE_DATABASE_ID). Silent fallback to in-memory or local storage is disabled in production.';
  }

  private failClosed(): never {
    throw new StoreError(503, this.errorMessage);
  }

  async getCatalogAndSettings(): Promise<{
    products: Product[];
    coupons: CouponDefinition[];
    settings: SiteSettingsConfig;
  }> {
    return this.failClosed();
  }

  async getOrderByNumber(): Promise<StoredOrder | null> {
    return this.failClosed();
  }

  async listCustomerOrders(): Promise<StoredOrder[]> {
    return this.failClosed();
  }

  async listAllOrders(): Promise<StoredOrder[]> {
    return this.failClosed();
  }

  async createOrderAtomic(): Promise<{ order: StoredOrder; duplicatePrevented: boolean }> {
    return this.failClosed();
  }

  async cancelOrderAtomic(): Promise<StoredOrder> {
    return this.failClosed();
  }

  async updateOrderStatusAtomic(): Promise<StoredOrder> {
    return this.failClosed();
  }

  async updateVariantStockAtomic(): Promise<Product> {
    return this.failClosed();
  }

  async createProductAtomic(): Promise<Product> {
    return this.failClosed();
  }

  async updateProductAtomic(): Promise<Product> {
    return this.failClosed();
  }

  async setProductArchiveStateAtomic(): Promise<Product> {
    return this.failClosed();
  }

  async listStockAdjustmentLogs(): Promise<StockAdjustmentLog[]> {
    return this.failClosed();
  }

  async upsertCouponAtomic(): Promise<CouponDefinition> {
    return this.failClosed();
  }

  async deleteCouponAtomic(): Promise<void> {
    return this.failClosed();
  }

  async listCustomerDirectory(): Promise<CustomerDirectoryRecord[]> {
    return this.failClosed();
  }

  async updateSiteSettingsAtomic(): Promise<SiteSettingsConfig> {
    return this.failClosed();
  }
}

/**
 * Resolves the Firebase Admin SDK Firestore instance if service-account credentials
 * (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`)
 * are configured in server environment variables. Never exposes secrets to client code.
 */
export function getFirebaseAdminFirestoreIfConfigured(
  env: NodeJS.ProcessEnv = process.env
): Firestore | null {
  const status = getProductionPersistenceConfigStatus(env);
  if (!status.configured) {
    return null;
  }

  const { projectId, firestoreDatabaseId } = status;
  const serviceAccountJsonRaw = (env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = (env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKeyRaw = (env.FIREBASE_PRIVATE_KEY || '').trim();

  let adminApp: AdminApp;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0]!;
  } else {
    if (serviceAccountJsonRaw) {
      const parsedCreds = parseServiceAccountCredentials(serviceAccountJsonRaw);
      adminApp = initializeApp({
        credential: cert(parsedCreds),
        projectId: String(parsedCreds.project_id || projectId || 'jerseyvalley-bd')
      });
    } else {
      const normalizedPrivateKey = parsePrivateKey(privateKeyRaw);
      const cleanEmail = clientEmail.replace(/^["']|["']$/g, '').trim();
      adminApp = initializeApp({
        credential: cert({
          projectId: projectId || 'jerseyvalley-bd',
          clientEmail: cleanEmail,
          privateKey: normalizedPrivateKey
        }),
        projectId: projectId || 'jerseyvalley-bd'
      });
    }
  }

  const cleanDbId = firestoreDatabaseId.replace(/^["']|["']$/g, '').trim() || '(default)';
  return cleanDbId && cleanDbId !== '(default)'
    ? getFirestore(adminApp, cleanDbId)
    : getFirestore(adminApp);
}

/**
 * Resolves the appropriate PersistenceAdapter for the given environment:
 * 1. If Firebase Admin SDK credentials are configured -> `FirestoreAdminPersistenceAdapter`
 * 2. If running in production (`NODE_ENV=production`, `VERCEL=1`, or `VERCEL_ENV=production`)
 *    and Firebase Admin credentials are missing/invalid -> `UnconfiguredProductionPersistenceAdapter`
 *    (fails closed with HTTP 503 StoreError; NEVER falls back to in-memory or local storage).
 * 3. Only in non-production local development/test -> `TransactionalStoreAdapter`.
 */
export function resolvePersistenceAdapterForEnv(
  env: NodeJS.ProcessEnv = process.env
): PersistenceAdapter {
  const configStatus = getProductionPersistenceConfigStatus(env);
  if (configStatus.configured) {
    try {
      const adminDb = getFirebaseAdminFirestoreIfConfigured(env);
      if (adminDb) {
        return new FirestoreAdminPersistenceAdapter(adminDb);
      }
    } catch (err) {
      if (configStatus.isProduction) {
        return new UnconfiguredProductionPersistenceAdapter(
          `Production persistence configuration error: Failed to initialize Firebase Admin SDK (${err instanceof Error ? err.message : 'invalid credentials'}). Silent fallback to in-memory storage is disabled in production.`
        );
      }
    }
  }

  if (configStatus.isProduction) {
    return new UnconfiguredProductionPersistenceAdapter(configStatus.reason);
  }

  return new TransactionalStoreAdapter({
    snapshotFilePath: env.PERSISTENT_STORE_FILE_PATH || undefined
  });
}

let defaultStoreInstance: PersistenceAdapter | null = null;

export function getDefaultPersistenceAdapter(): PersistenceAdapter {
  if (!defaultStoreInstance) {
    defaultStoreInstance = resolvePersistenceAdapterForEnv(process.env);
  }
  return defaultStoreInstance;
}

