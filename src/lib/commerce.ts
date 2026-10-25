export type JerseyCategory = 'national' | 'club' | 'retro';
export type KitType = 'Home' | 'Away' | 'Third' | 'Retro' | 'Special';
export type EditionTier = 'Fan Replica' | 'Player Fit Replica' | 'Heritage Retro Replica';
export type GenderFit = 'Men' | 'Women' | 'Kids' | 'Unisex';
export type JerseySize = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export type PaymentMethod = 'COD' | 'BKASH' | 'NAGAD';
export type PaymentStatus = 'UNPAID_COD' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REFUNDED';
export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface SizeVariant {
  size: JerseySize;
  sku: string;
  priceBdt: number;
  stock: number;
  isActive: boolean;
  chestInches: string;
  lengthInches: string;
}

export interface KitVisualSpec {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  pattern: 'stripes' | 'solid' | 'halves' | 'pinstripe' | 'hoops' | 'sash';
  collarStyle: 'crew' | 'v-neck' | 'polo';
  crestCode: string;
  defaultPreviewName: string;
  defaultPreviewNumber: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  team: string;
  countryOrLeague: string;
  category: JerseyCategory;
  kitType: KitType;
  editionTier: EditionTier;
  gender: GenderFit;
  season: string;
  priceBdt: number;
  customPrintPriceBdt: number;
  description: string;
  fabricSpec: string;
  fitNote: string;
  careInstructions: string;
  isActive: boolean;
  isDemo: boolean;
  featuredRank: number;
  createdAt: string;
  updatedAt: string;
  variants: SizeVariant[];
  visual: KitVisualSpec;
}

export interface CartItemInput {
  productId: string;
  size: JerseySize;
  quantity: number;
  customName?: string;
  customNumber?: string;
}

export interface PricedOrderItem {
  productId: string;
  slug: string;
  productName: string;
  team: string;
  editionTier: EditionTier;
  size: JerseySize;
  sku: string;
  quantity: number;
  baseUnitPriceBdt: number;
  customName: string;
  customNumber: string;
  hasCustomPrint: boolean;
  customPrintUnitFeeBdt: number;
  finalUnitPriceBdt: number;
  lineTotalBdt: number;
}

export interface CouponDefinition {
  code: string;
  description: string;
  discountType: 'PERCENTAGE' | 'FIXED_BDT';
  value: number;
  minSubtotalBdt: number;
  maxDiscountBdt?: number;
  isActive: boolean;
}

export interface SiteSettingsConfig {
  announcementText: string;
  insideDhakaShippingBdt: number;
  outsideDhakaShippingBdt: number;
  freeShippingThresholdBdt: number;
  bkashMerchantEnabled: boolean;
  nagadMerchantEnabled: boolean;
  returnWindowDays: number;
  updatedAt: string;
}

export interface OrderCalculationResult {
  valid: boolean;
  error?: string;
  items: PricedOrderItem[];
  itemCount: number;
  subtotalBdt: number;
  customizationTotalBdt: number;
  discountBdt: number;
  appliedCouponCode: string | null;
  couponMessage?: string;
  shippingBdt: number;
  shippingZoneLabel: string;
  totalBdt: number;
}

export const BANGLADESH_DIVISIONS: Record<
  string,
  { districts: Record<string, string[]> }
> = {
  Dhaka: {
    districts: {
      Dhaka: ['Dhanmondi', 'Gulshan', 'Banani', 'Uttara', 'Mirpur', 'Mohammadpur', 'Motijheel', 'Badda', 'Tejgaon', 'Savar'],
      Gazipur: ['Tongi', 'Gazipur Sadar', 'Kaliakair', 'Sreepur'],
      Narayanganj: ['Narayanganj Sadar', 'Siddhirganj', 'Fatullah', 'Rupganj'],
      Tangail: ['Tangail Sadar', 'Mirzapur', 'Sakhipur']
    }
  },
  Chattogram: {
    districts: {
      Chattogram: ['Panchlaish', 'Agrabad', 'Halishahar', 'Khulshi', 'Kotwali', 'Pahartali'],
      "Cox's Bazar": ["Cox's Bazar Sadar", 'Chakaria', 'Teknaf', 'Ukhiya'],
      Cumilla: ['Cumilla Sadar', 'Laksam', 'Daudkandi'],
      Noakhali: ['Begumganj', 'Noakhali Sadar', 'Senbagh']
    }
  },
  Sylhet: {
    districts: {
      Sylhet: ['Sylhet Sadar', 'Zindabazar', 'Amberkhana', 'Beanibazar', 'Golapganj'],
      Moulvibazar: ['Sreemangal', 'Moulvibazar Sadar', 'Kulaura'],
      Habiganj: ['Habiganj Sadar', 'Madhabpur']
    }
  },
  Rajshahi: {
    districts: {
      Rajshahi: ['Boalia', 'Rajpara', 'Motihar', 'Paba'],
      Bogura: ['Bogura Sadar', 'Sherpur', 'Shajahanpur'],
      Pabna: ['Pabna Sadar', 'Ishwardi']
    }
  },
  Khulna: {
    districts: {
      Khulna: ['Khulna Sadar', 'Sonadanga', 'Khalishpur', 'Daulatpur'],
      Jashore: ['Jashore Sadar', 'Abhaynagar', 'Benapole'],
      Kushtia: ['Kushtia Sadar', 'Kumarkhali']
    }
  },
  Barishal: {
    districts: {
      Barishal: ['Barishal Sadar', 'Bakerganj', 'Babuganj'],
      Bhola: ['Bhola Sadar', 'Char Fasson']
    }
  },
  Rangpur: {
    districts: {
      Rangpur: ['Rangpur Sadar', 'Mithapukur', 'Badarganj'],
      Dinajpur: ['Dinajpur Sadar', 'Birganj', 'Parbatipur']
    }
  },
  Mymensingh: {
    districts: {
      Mymensingh: ['Mymensingh Sadar', 'Bhaluka', 'Trishal', 'Gafargaon'],
      Jamalpur: ['Jamalpur Sadar', 'Sarishabari']
    }
  }
};

/**
 * Formats an integer/number as Bangladeshi Taka (৳) with tabular numerals compatibility.
 */
export function formatBdt(amount: number): string {
  const rounded = Math.round(amount);
  return `৳${rounded.toLocaleString('en-IN')}`;
}

/**
 * Validates and normalizes a Bangladesh mobile phone number.
 * Valid operators: 013, 014, 015, 016, 017, 018, 019 (11 digits local or +8801XXXXXXXXX).
 */
export function validateBangladeshPhone(rawPhone: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const cleaned = rawPhone.replace(/[\s\-()]/g, '');
  const regex = /^(\+?880|0)(1[3-9]\d{8})$/;
  const match = cleaned.match(regex);
  if (!match) {
    return {
      valid: false,
      normalized: cleaned,
      error: 'Enter a valid 11-digit Bangladesh mobile number (e.g., 01712345678).'
    };
  }
  return {
    valid: true,
    normalized: `0${match[2]}`
  };
}

/**
 * Validates optional custom player name and squad number printing.
 */
export function validateCustomization(
  rawName?: string,
  rawNumber?: string
): {
  valid: boolean;
  customName: string;
  customNumber: string;
  hasCustomPrint: boolean;
  error?: string;
} {
  const customName = (rawName ?? '').trim().toUpperCase();
  const customNumber = (rawNumber ?? '').trim();

  if (!customName && !customNumber) {
    return { valid: true, customName: '', customNumber: '', hasCustomPrint: false };
  }

  if (customName) {
    if (customName.length > 12) {
      return {
        valid: false,
        customName,
        customNumber,
        hasCustomPrint: true,
        error: 'Custom name printing supports up to 12 characters.'
      };
    }
    if (!/^[A-Z.\-\s]+$/.test(customName)) {
      return {
        valid: false,
        customName,
        customNumber,
        hasCustomPrint: true,
        error: 'Custom name may only contain letters A–Z, spaces, dots, or hyphens.'
      };
    }
  }

  if (customNumber) {
    if (!/^\d{1,2}$/.test(customNumber)) {
      return {
        valid: false,
        customName,
        customNumber,
        hasCustomPrint: true,
        error: 'Squad number must be 1 or 2 digits (0–99).'
      };
    }
  }

  return {
    valid: true,
    customName,
    customNumber,
    hasCustomPrint: true
  };
}

/**
 * Calculates shipping fee in BDT based on division/district and configurable thresholds.
 */
export function calculateShippingBdt(
  division: string,
  district: string,
  subtotalAfterDiscountBdt: number,
  settings: Pick<
    SiteSettingsConfig,
    'insideDhakaShippingBdt' | 'outsideDhakaShippingBdt' | 'freeShippingThresholdBdt'
  >
): { shippingBdt: number; zoneLabel: string } {
  const isInsideDhaka =
    division.trim().toLowerCase() === 'dhaka' && district.trim().toLowerCase() === 'dhaka';
  const baseZoneLabel = isInsideDhaka
    ? 'Inside Dhaka Metro (24–48h Dispatch)'
    : 'Outside Dhaka Nationwide Courier (2–4 Business Days)';

  if (
    settings.freeShippingThresholdBdt > 0 &&
    subtotalAfterDiscountBdt >= settings.freeShippingThresholdBdt
  ) {
    return {
      shippingBdt: 0,
      zoneLabel: `${baseZoneLabel} — Free Delivery Eligible`
    };
  }

  return {
    shippingBdt: isInsideDhaka ? settings.insideDhakaShippingBdt : settings.outsideDhakaShippingBdt,
    zoneLabel: baseZoneLabel
  };
}

/**
 * Validates a coupon code against current subtotal and active coupon definitions.
 */
export function calculateCouponDiscount(
  couponCode: string | undefined,
  subtotalBdt: number,
  coupons: CouponDefinition[]
): {
  valid: boolean;
  discountBdt: number;
  appliedCode: string | null;
  message?: string;
} {
  const normalized = (couponCode ?? '').trim().toUpperCase();
  if (!normalized) {
    return { valid: true, discountBdt: 0, appliedCode: null };
  }

  const found = coupons.find((c) => c.code.toUpperCase() === normalized && c.isActive);
  if (!found) {
    return {
      valid: false,
      discountBdt: 0,
      appliedCode: null,
      message: `Coupon "${normalized}" is invalid or expired.`
    };
  }

  if (subtotalBdt < found.minSubtotalBdt) {
    return {
      valid: false,
      discountBdt: 0,
      appliedCode: null,
      message: `Coupon "${found.code}" requires a minimum order subtotal of ${formatBdt(found.minSubtotalBdt)}.`
    };
  }

  let rawDiscount = 0;
  if (found.discountType === 'PERCENTAGE') {
    rawDiscount = Math.round((subtotalBdt * found.value) / 100);
    if (found.maxDiscountBdt && rawDiscount > found.maxDiscountBdt) {
      rawDiscount = found.maxDiscountBdt;
    }
  } else {
    rawDiscount = found.value;
  }

  const boundedDiscount = Math.min(rawDiscount, subtotalBdt);
  return {
    valid: true,
    discountBdt: boundedDiscount,
    appliedCode: found.code,
    message: `${found.code} applied (-${formatBdt(boundedDiscount)})`
  };
}

/**
 * Trusted server-authoritative order calculation from catalog, cart items, coupon, and location.
 */
export function calculateOrderTotals(params: {
  items: CartItemInput[];
  catalog: Product[];
  coupons: CouponDefinition[];
  settings: SiteSettingsConfig;
  couponCode?: string;
  division?: string;
  district?: string;
}): OrderCalculationResult {
  const {
    items,
    catalog,
    coupons,
    settings,
    couponCode,
    division = 'Dhaka',
    district = 'Dhaka'
  } = params;

  if (!items || items.length === 0) {
    return {
      valid: false,
      error: 'Your shopping bag is empty.',
      items: [],
      itemCount: 0,
      subtotalBdt: 0,
      customizationTotalBdt: 0,
      discountBdt: 0,
      appliedCouponCode: null,
      shippingBdt: 0,
      shippingZoneLabel: '',
      totalBdt: 0
    };
  }

  const pricedItems: PricedOrderItem[] = [];
  let subtotalBdt = 0;
  let customizationTotalBdt = 0;
  let itemCount = 0;

  // Aggregate requested quantities per productId + size to prevent split-line overselling
  const requestedVariantQty = new Map<string, number>();

  for (const rawItem of items) {
    if (!Number.isInteger(rawItem.quantity) || rawItem.quantity < 1 || rawItem.quantity > 20) {
      return {
        valid: false,
        error: 'Each item quantity must be between 1 and 20.',
        items: [],
        itemCount: 0,
        subtotalBdt: 0,
        customizationTotalBdt: 0,
        discountBdt: 0,
        appliedCouponCode: null,
        shippingBdt: 0,
        shippingZoneLabel: '',
        totalBdt: 0
      };
    }

    const product = catalog.find((p) => p.id === rawItem.productId && p.isActive);
    if (!product) {
      return {
        valid: false,
        error: `Product "${rawItem.productId}" is unavailable or inactive.`,
        items: [],
        itemCount: 0,
        subtotalBdt: 0,
        customizationTotalBdt: 0,
        discountBdt: 0,
        appliedCouponCode: null,
        shippingBdt: 0,
        shippingZoneLabel: '',
        totalBdt: 0
      };
    }

    const variant = product.variants.find((v) => v.size === rawItem.size && v.isActive);
    if (!variant) {
      return {
        valid: false,
        error: `Size ${rawItem.size} is not available for ${product.name}.`,
        items: [],
        itemCount: 0,
        subtotalBdt: 0,
        customizationTotalBdt: 0,
        discountBdt: 0,
        appliedCouponCode: null,
        shippingBdt: 0,
        shippingZoneLabel: '',
        totalBdt: 0
      };
    }

    const variantKey = `${product.id}:${variant.size}`;
    const cumulativeQty = (requestedVariantQty.get(variantKey) ?? 0) + rawItem.quantity;
    requestedVariantQty.set(variantKey, cumulativeQty);

    if (cumulativeQty > variant.stock) {
      return {
        valid: false,
        error: `Insufficient stock for ${product.name} (Size ${variant.size}). Only ${variant.stock} left in stock.`,
        items: [],
        itemCount: 0,
        subtotalBdt: 0,
        customizationTotalBdt: 0,
        discountBdt: 0,
        appliedCouponCode: null,
        shippingBdt: 0,
        shippingZoneLabel: '',
        totalBdt: 0
      };
    }

    const customCheck = validateCustomization(rawItem.customName, rawItem.customNumber);
    if (!customCheck.valid) {
      return {
        valid: false,
        error: customCheck.error ?? 'Invalid jersey customization.',
        items: [],
        itemCount: 0,
        subtotalBdt: 0,
        customizationTotalBdt: 0,
        discountBdt: 0,
        appliedCouponCode: null,
        shippingBdt: 0,
        shippingZoneLabel: '',
        totalBdt: 0
      };
    }

    const baseUnitPriceBdt = variant.priceBdt;
    const customPrintUnitFeeBdt = customCheck.hasCustomPrint ? product.customPrintPriceBdt : 0;
    const finalUnitPriceBdt = baseUnitPriceBdt + customPrintUnitFeeBdt;
    const lineTotalBdt = finalUnitPriceBdt * rawItem.quantity;

    subtotalBdt += lineTotalBdt;
    customizationTotalBdt += customPrintUnitFeeBdt * rawItem.quantity;
    itemCount += rawItem.quantity;

    pricedItems.push({
      productId: product.id,
      slug: product.slug,
      productName: product.name,
      team: product.team,
      editionTier: product.editionTier,
      size: variant.size,
      sku: variant.sku,
      quantity: rawItem.quantity,
      baseUnitPriceBdt,
      customName: customCheck.customName,
      customNumber: customCheck.customNumber,
      hasCustomPrint: customCheck.hasCustomPrint,
      customPrintUnitFeeBdt,
      finalUnitPriceBdt,
      lineTotalBdt
    });
  }

  const couponResult = calculateCouponDiscount(couponCode, subtotalBdt, coupons);
  if (couponCode && couponCode.trim() !== '' && !couponResult.valid) {
    const shippingFallback = calculateShippingBdt(division, district, subtotalBdt, settings);
    return {
      valid: false,
      error: couponResult.message,
      items: pricedItems,
      itemCount,
      subtotalBdt,
      customizationTotalBdt,
      discountBdt: 0,
      appliedCouponCode: null,
      couponMessage: couponResult.message,
      shippingBdt: shippingFallback.shippingBdt,
      shippingZoneLabel: shippingFallback.zoneLabel,
      totalBdt: subtotalBdt + shippingFallback.shippingBdt
    };
  }

  const subtotalAfterDiscount = Math.max(0, subtotalBdt - couponResult.discountBdt);
  const shippingResult = calculateShippingBdt(division, district, subtotalAfterDiscount, settings);
  const totalBdt = subtotalAfterDiscount + shippingResult.shippingBdt;

  return {
    valid: true,
    items: pricedItems,
    itemCount,
    subtotalBdt,
    customizationTotalBdt,
    discountBdt: couponResult.discountBdt,
    appliedCouponCode: couponResult.appliedCode,
    couponMessage: couponResult.message,
    shippingBdt: shippingResult.shippingBdt,
    shippingZoneLabel: shippingResult.zoneLabel,
    totalBdt
  };
}

export interface CatalogFilterParams {
  query?: string;
  category?: string;
  kitType?: string;
  size?: string;
  gender?: string;
  team?: string;
  maxPriceBdt?: number;
  inStockOnly?: boolean;
  sortBy?: 'featured' | 'newest' | 'price-asc' | 'price-desc';
}

/**
 * Filters and sorts catalog products with full multi-attribute support.
 */
export function filterAndSortProducts(
  products: Product[],
  filters: CatalogFilterParams
): Product[] {
  const q = (filters.query ?? '').trim().toLowerCase();

  const filtered = products.filter((product) => {
    if (!product.isActive) return false;

    if (q) {
      const searchable = [
        product.name,
        product.team,
        product.countryOrLeague,
        product.kitType,
        product.editionTier,
        product.season,
        product.description
      ]
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    if (filters.category && filters.category !== 'all') {
      if (product.category !== filters.category) return false;
    }

    if (filters.kitType && filters.kitType !== 'all') {
      if (product.kitType.toLowerCase() !== filters.kitType.toLowerCase()) return false;
    }

    if (filters.gender && filters.gender !== 'all') {
      if (
        product.gender.toLowerCase() !== filters.gender.toLowerCase() &&
        product.gender !== 'Unisex'
      ) {
        return false;
      }
    }

    if (filters.team && filters.team !== 'all') {
      if (product.team.toLowerCase() !== filters.team.toLowerCase()) return false;
    }

    if (typeof filters.maxPriceBdt === 'number' && filters.maxPriceBdt > 0) {
      if (product.priceBdt > filters.maxPriceBdt) return false;
    }

    const totalStock = product.variants.reduce((acc, v) => acc + (v.isActive ? v.stock : 0), 0);
    if (filters.inStockOnly && totalStock <= 0) {
      return false;
    }

    if (filters.size && filters.size !== 'all') {
      const hasSizeInStock = product.variants.some(
        (v) => v.size === filters.size && v.isActive && v.stock > 0
      );
      if (!hasSizeInStock) return false;
    }

    return true;
  });

  const sorted = [...filtered];
  const sortBy = filters.sortBy ?? 'featured';

  if (sortBy === 'price-asc') {
    sorted.sort((a, b) => a.priceBdt - b.priceBdt);
  } else if (sortBy === 'price-desc') {
    sorted.sort((a, b) => b.priceBdt - a.priceBdt);
  } else if (sortBy === 'newest') {
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    sorted.sort((a, b) => a.featuredRank - b.featuredRank);
  }

  return sorted;
}

/**
 * Enforces COD and online payment order state transitions.
 */
export function validateOrderStateTransition(params: {
  currentOrderStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
  nextOrderStatus: OrderStatus;
  nextPaymentStatus: PaymentStatus;
  actorRole: 'customer' | 'admin';
}): { allowed: boolean; error?: string } {
  const {
    currentOrderStatus,
    currentPaymentStatus,
    nextOrderStatus,
    nextPaymentStatus,
    actorRole
  } = params;

  if (actorRole === 'customer') {
    if (currentOrderStatus !== 'PENDING_CONFIRMATION') {
      return {
        allowed: false,
        error: 'Customers can only cancel an order before it is confirmed for fulfillment.'
      };
    }
    if (nextOrderStatus !== 'CANCELLED' || nextPaymentStatus !== currentPaymentStatus) {
      return {
        allowed: false,
        error: 'Customers may only transition pending orders to CANCELLED.'
      };
    }
    return { allowed: true };
  }

  // Admin rules: cannot mark DELIVERED if CANCELLED
  if (currentOrderStatus === 'CANCELLED' && nextOrderStatus === 'DELIVERED') {
    return {
      allowed: false,
      error: 'A cancelled order cannot be marked as delivered.'
    };
  }

  return { allowed: true };
}
