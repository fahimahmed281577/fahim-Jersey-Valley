import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBangladeshPhone,
  validateCustomization,
  calculateShippingBdt,
  calculateCouponDiscount,
  calculateOrderTotals,
  filterAndSortProducts,
  validateOrderStateTransition,
  formatBdt,
  type Product,
  type CouponDefinition,
  type SiteSettingsConfig
} from './commerce';

const mockSettings: SiteSettingsConfig = {
  announcementText: 'Cash on Delivery Nationwide across Bangladesh',
  insideDhakaShippingBdt: 70,
  outsideDhakaShippingBdt: 130,
  freeShippingThresholdBdt: 3000,
  bkashMerchantEnabled: false,
  nagadMerchantEnabled: false,
  returnWindowDays: 7,
  updatedAt: '2026-10-25T00:00:00.000Z'
};

const mockCoupons: CouponDefinition[] = [
  {
    code: 'VALLEY10',
    description: '10% off orders ৳1,500+',
    discountType: 'PERCENTAGE',
    value: 10,
    minSubtotalBdt: 1500,
    maxDiscountBdt: 500,
    isActive: true
  },
  {
    code: 'DHAKA60',
    description: '৳60 off orders ৳1,200+',
    discountType: 'FIXED_BDT',
    value: 60,
    minSubtotalBdt: 1200,
    isActive: true
  }
];

const mockCatalog: Product[] = [
  {
    id: 'arg-home-2026',
    slug: 'argentina-2026-home-replica',
    name: 'Argentina 2026 Home Fan Replica Jersey',
    team: 'Argentina',
    countryOrLeague: 'CONMEBOL / International',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1350,
    customPrintPriceBdt: 350,
    description: 'Replica fan jersey featuring sky blue and white stripes.',
    fabricSpec: '165 GSM AeroMesh 100% Polyester',
    fitNote: 'Regular fan fit',
    careInstructions: 'Cold wash inside out',
    isActive: true,
    isDemo: true,
    featuredRank: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    variants: [
      { size: 'M', sku: 'ARG-26-M', priceBdt: 1350, stock: 5, isActive: true, chestInches: '39-40"', lengthInches: '28"' },
      { size: 'L', sku: 'ARG-26-L', priceBdt: 1350, stock: 2, isActive: true, chestInches: '41-42"', lengthInches: '29"' },
      { size: 'XL', sku: 'ARG-26-XL', priceBdt: 1350, stock: 0, isActive: true, chestInches: '43-44"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#75AADB',
      secondaryColor: '#FFFFFF',
      accentColor: '#D4AF37',
      textColor: '#111111',
      pattern: 'stripes',
      collarStyle: 'crew',
      crestCode: 'ARG',
      defaultPreviewName: 'MESSI',
      defaultPreviewNumber: '10'
    }
  },
  {
    id: 'barca-1999-retro',
    slug: 'barcelona-1999-centenary-retro',
    name: 'FC Barcelona 1999 Centenary Heritage Retro Replica',
    team: 'FC Barcelona',
    countryOrLeague: 'La Liga Heritage',
    category: 'retro',
    kitType: 'Retro',
    editionTier: 'Heritage Retro Replica',
    gender: 'Men',
    season: '1999/00',
    priceBdt: 1850,
    customPrintPriceBdt: 400,
    description: 'Classic split half-and-half heritage replica jersey.',
    fabricSpec: '190 GSM Heavy Pique Knit',
    fitNote: 'Relaxed 90s retro fit',
    careInstructions: 'Hand wash recommended',
    isActive: true,
    isDemo: true,
    featuredRank: 2,
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    variants: [
      { size: 'L', sku: 'FCB-99-L', priceBdt: 1850, stock: 4, isActive: true, chestInches: '42"', lengthInches: '29.5"' }
    ],
    visual: {
      primaryColor: '#8B0032',
      secondaryColor: '#002B5C',
      accentColor: '#EDBB00',
      textColor: '#FFFFFF',
      pattern: 'halves',
      collarStyle: 'polo',
      crestCode: 'FCB',
      defaultPreviewName: 'RIVALDO',
      defaultPreviewNumber: '11'
    }
  }
];

test('Bangladesh phone number validation handles valid local and +880 numbers and rejects invalid ones', () => {
  const validLocal = validateBangladeshPhone('01712-345678');
  assert.equal(validLocal.valid, true);
  assert.equal(validLocal.normalized, '01712345678');

  const validIntl = validateBangladeshPhone('+880 1819 876543');
  assert.equal(validIntl.valid, true);
  assert.equal(validIntl.normalized, '01819876543');

  const invalidPrefix = validateBangladeshPhone('01112345678');
  assert.equal(invalidPrefix.valid, false);

  const invalidShort = validateBangladeshPhone('01712345');
  assert.equal(invalidShort.valid, false);
});

test('Jersey customization validation enforces name length, character set, and squad number range', () => {
  const empty = validateCustomization('', '');
  assert.equal(empty.valid, true);
  assert.equal(empty.hasCustomPrint, false);

  const validPrint = validateCustomization('hamza', '8');
  assert.equal(validPrint.valid, true);
  assert.equal(validPrint.customName, 'HAMZA');
  assert.equal(validPrint.customNumber, '8');
  assert.equal(validPrint.hasCustomPrint, true);

  const tooLong = validateCustomization('ALEXANDERARNOLD', '66');
  assert.equal(tooLong.valid, false);

  const badNumber = validateCustomization('MESSI', '100');
  assert.equal(badNumber.valid, false);
});

test('Shipping calculation differentiates Inside Dhaka, Outside Dhaka, and Free Shipping threshold', () => {
  const insideDhaka = calculateShippingBdt('Dhaka', 'Dhaka', 1350, mockSettings);
  assert.equal(insideDhaka.shippingBdt, 70);

  const outsideDhaka = calculateShippingBdt('Chattogram', 'Chattogram', 1350, mockSettings);
  assert.equal(outsideDhaka.shippingBdt, 130);

  const freeEligible = calculateShippingBdt('Sylhet', 'Sylhet', 3200, mockSettings);
  assert.equal(freeEligible.shippingBdt, 0);
});

test('Server-authoritative order calculation computes customization fee, coupon discount, and prevents overselling', () => {
  const calc = calculateOrderTotals({
    items: [
      {
        productId: 'arg-home-2026',
        size: 'L',
        quantity: 1,
        customName: 'MESSI',
        customNumber: '10'
      }
    ],
    catalog: mockCatalog,
    coupons: mockCoupons,
    settings: mockSettings,
    couponCode: 'VALLEY10',
    division: 'Dhaka',
    district: 'Dhaka'
  });

  // Base 1350 + Custom Print 350 = 1700 subtotal. VALLEY10 = 170 discount. 1530 + 70 shipping = 1600.
  assert.equal(calc.valid, true);
  assert.equal(calc.subtotalBdt, 1700);
  assert.equal(calc.customizationTotalBdt, 350);
  assert.equal(calc.discountBdt, 170);
  assert.equal(calc.shippingBdt, 70);
  assert.equal(calc.totalBdt, 1600);
  assert.equal(formatBdt(calc.totalBdt), '৳1,600');

  // Out of stock XL must fail
  const outOfStock = calculateOrderTotals({
    items: [{ productId: 'arg-home-2026', size: 'XL', quantity: 1 }],
    catalog: mockCatalog,
    coupons: mockCoupons,
    settings: mockSettings
  });
  assert.equal(outOfStock.valid, false);
  assert.ok(outOfStock.error?.includes('Insufficient stock'));
});

test('Catalog filtering and sorting works across category, size availability, and price sort', () => {
  const retroOnly = filterAndSortProducts(mockCatalog, { category: 'retro' });
  assert.equal(retroOnly.length, 1);
  assert.equal(retroOnly[0].id, 'barca-1999-retro');

  const sizeM = filterAndSortProducts(mockCatalog, { size: 'M' });
  assert.equal(sizeM.length, 1);
  assert.equal(sizeM[0].id, 'arg-home-2026');

  const descPrice = filterAndSortProducts(mockCatalog, { sortBy: 'price-desc' });
  assert.equal(descPrice[0].id, 'barca-1999-retro');
});

test('Order state transitions lock terminal states for customers and preserve COD payment distinction', () => {
  const validCancel = validateOrderStateTransition({
    currentOrderStatus: 'PENDING_CONFIRMATION',
    currentPaymentStatus: 'UNPAID_COD',
    nextOrderStatus: 'CANCELLED',
    nextPaymentStatus: 'UNPAID_COD',
    actorRole: 'customer'
  });
  assert.equal(validCancel.allowed, true);

  const illegalCustomerPaid = validateOrderStateTransition({
    currentOrderStatus: 'PENDING_CONFIRMATION',
    currentPaymentStatus: 'UNPAID_COD',
    nextOrderStatus: 'CONFIRMED',
    nextPaymentStatus: 'VERIFIED',
    actorRole: 'customer'
  });
  assert.equal(illegalCustomerPaid.allowed, false);
});
