import type { Product, CouponDefinition, SiteSettingsConfig } from '../lib/commerce';

export const INITIAL_SITE_SETTINGS: SiteSettingsConfig = {
  announcementText:
    'Nationwide Cash on Delivery across Bangladesh · Inside Dhaka ৳70 · Outside Dhaka ৳130 · Free Delivery on Orders ৳3,000+',
  insideDhakaShippingBdt: 70,
  outsideDhakaShippingBdt: 130,
  freeShippingThresholdBdt: 3000,
  bkashMerchantEnabled: false,
  nagadMerchantEnabled: false,
  returnWindowDays: 7,
  updatedAt: '2026-10-25T04:00:00.000Z'
};

export const INITIAL_COUPONS: CouponDefinition[] = [
  {
    code: 'VALLEY10',
    description: '10% off on orders of ৳1,500 or more (up to ৳500 discount)',
    discountType: 'PERCENTAGE',
    value: 10,
    minSubtotalBdt: 1500,
    maxDiscountBdt: 500,
    isActive: true
  },
  {
    code: 'DHAKA60',
    description: 'Flat ৳60 off on orders of ৳1,200 or more',
    discountType: 'FIXED_BDT',
    value: 60,
    minSubtotalBdt: 1200,
    isActive: true
  },
  {
    code: 'MATCHDAY200',
    description: 'Flat ৳200 off when ordering 2+ jerseys (min subtotal ৳2,600)',
    discountType: 'FIXED_BDT',
    value: 200,
    minSubtotalBdt: 2600,
    isActive: true
  }
];

export const INITIAL_CATALOG: Product[] = [
  {
    id: 'arg-home-2026',
    slug: 'argentina-2026-home-fan-replica',
    name: 'Argentina 2026 Home Fan Replica Jersey',
    team: 'Argentina',
    countryOrLeague: 'International · CONMEBOL',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1350,
    customPrintPriceBdt: 350,
    description:
      'High-grade fan replica jersey inspired by the Albiceleste classic sky-blue and crisp white vertical stripes. Crafted with moisture-wicking micro-eyelet polyester tailored for humid matchdays in Bangladesh. Note: This is a fan replica product, not officially licensed team merchandise.',
    fabricSpec: '165 GSM AeroMesh 100% Breathable Polyester · Embroidered Woven Crest',
    fitNote: 'Regular stadium fan fit. True to standard Asian/BD chest sizing.',
    careInstructions: 'Machine wash cold inside-out. Do not iron directly over custom thermal print.',
    isActive: true,
    isDemo: true,
    featuredRank: 1,
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-ARG26-S', priceBdt: 1350, stock: 6, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-ARG26-M', priceBdt: 1350, stock: 12, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-ARG26-L', priceBdt: 1350, stock: 9, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-ARG26-XL', priceBdt: 1350, stock: 5, isActive: true, chestInches: '43–44"', lengthInches: '30"' },
      { size: 'XXL', sku: 'JV-ARG26-XXL', priceBdt: 1350, stock: 2, isActive: true, chestInches: '45–46"', lengthInches: '31"' }
    ],
    visual: {
      primaryColor: '#6CA6CD',
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
    id: 'bd-home-2026',
    slug: 'bangladesh-national-green-home-replica',
    name: 'Bangladesh Bengal Green Home Fan Replica Jersey',
    team: 'Bangladesh',
    countryOrLeague: 'International · SAFF / AFC',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2025/26',
    priceBdt: 1150,
    customPrintPriceBdt: 300,
    description:
      'Supporter replica jersey in deep Bengal forest green with crimson red ribbed collar and cuff trim. Designed for local supporters cheering at Bashundhara Kings Arena and across the country. Clearly labelled supporter replica apparel.',
    fabricSpec: '160 GSM DryKnit Breathable Interlock Polyester · Sublimated Geometric Weave',
    fitNote: 'Standard Bangladesh regular fit.',
    careInstructions: 'Cold gentle wash. Hang dry in shade.',
    isActive: true,
    isDemo: true,
    featuredRank: 2,
    createdAt: '2026-10-25T01:00:00.000Z',
    updatedAt: '2026-10-25T01:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-BAN26-S', priceBdt: 1150, stock: 8, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-BAN26-M', priceBdt: 1150, stock: 15, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-BAN26-L', priceBdt: 1150, stock: 14, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-BAN26-XL', priceBdt: 1150, stock: 7, isActive: true, chestInches: '43–44"', lengthInches: '30"' },
      { size: 'XXL', sku: 'JV-BAN26-XXL', priceBdt: 1150, stock: 4, isActive: true, chestInches: '45–46"', lengthInches: '31"' }
    ],
    visual: {
      primaryColor: '#006A4E',
      secondaryColor: '#00523C',
      accentColor: '#F42A41',
      textColor: '#FFFFFF',
      pattern: 'sash',
      collarStyle: 'v-neck',
      crestCode: 'BAN',
      defaultPreviewName: 'HAMZA',
      defaultPreviewNumber: '8'
    }
  },
  {
    id: 'bra-home-2026',
    slug: 'brazil-2026-home-fan-replica',
    name: 'Brazil 2026 Seleção Yellow Home Fan Replica',
    team: 'Brazil',
    countryOrLeague: 'International · CONMEBOL',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1350,
    customPrintPriceBdt: 350,
    description:
      'Iconic canary yellow fan replica shirt with forest green V-neck collar and subtle tonal jacquard pattern. Lightweight construction built for everyday wear and five-a-side turf sessions. Unofficial supporter replica.',
    fabricSpec: '165 GSM Jacquard Breathable Mesh Polyester · Woven Supporter Crest',
    fitNote: 'Regular stadium fit.',
    careInstructions: 'Cold wash inside out. Do not bleach.',
    isActive: true,
    isDemo: true,
    featuredRank: 3,
    createdAt: '2026-10-23T12:00:00.000Z',
    updatedAt: '2026-10-23T12:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-BRA26-S', priceBdt: 1350, stock: 5, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-BRA26-M', priceBdt: 1350, stock: 10, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-BRA26-L', priceBdt: 1350, stock: 8, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-BRA26-XL', priceBdt: 1350, stock: 4, isActive: true, chestInches: '43–44"', lengthInches: '30"' },
      { size: 'XXL', sku: 'JV-BRA26-XXL', priceBdt: 1350, stock: 0, isActive: true, chestInches: '45–46"', lengthInches: '31"' }
    ],
    visual: {
      primaryColor: '#FACC15',
      secondaryColor: '#EAB308',
      accentColor: '#15803D',
      textColor: '#15803D',
      pattern: 'solid',
      collarStyle: 'v-neck',
      crestCode: 'BRA',
      defaultPreviewName: 'VINI JR',
      defaultPreviewNumber: '7'
    }
  },
  {
    id: 'rma-home-2526',
    slug: 'real-madrid-25-26-home-player-fit-replica',
    name: 'Madrid Blanco 25/26 Home Player Fit Replica',
    team: 'Real Madrid',
    countryOrLeague: 'Club · Spain',
    category: 'club',
    kitType: 'Home',
    editionTier: 'Player Fit Replica',
    gender: 'Men',
    season: '2025/26',
    priceBdt: 1650,
    customPrintPriceBdt: 350,
    description:
      'Athletic player-fit replica edition in clean pearl white with charcoal-black contrast piping and laser-perforated side ventilation panels. Features heat-applied TPU crest for zero chafing during turf matches. Replica edition.',
    fabricSpec: '175 GSM 4-Way Stretch Honeycomb Player-Fit Polyester · Heat-Sealed Crest',
    fitNote: 'Slim athletic cut. Order one size up if you prefer a relaxed fit.',
    careInstructions: 'Hand wash cold only. Never tumble dry.',
    isActive: true,
    isDemo: true,
    featuredRank: 4,
    createdAt: '2026-10-22T15:00:00.000Z',
    updatedAt: '2026-10-22T15:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-RMA26-S', priceBdt: 1650, stock: 4, isActive: true, chestInches: '36–37"', lengthInches: '26.5"' },
      { size: 'M', sku: 'JV-RMA26-M', priceBdt: 1650, stock: 9, isActive: true, chestInches: '38–39"', lengthInches: '27.5"' },
      { size: 'L', sku: 'JV-RMA26-L', priceBdt: 1650, stock: 7, isActive: true, chestInches: '40–41"', lengthInches: '28.5"' },
      { size: 'XL', sku: 'JV-RMA26-XL', priceBdt: 1650, stock: 3, isActive: true, chestInches: '42–43"', lengthInches: '29.5"' }
    ],
    visual: {
      primaryColor: '#FAFAFA',
      secondaryColor: '#E4E4E7',
      accentColor: '#111111',
      textColor: '#111111',
      pattern: 'pinstripe',
      collarStyle: 'v-neck',
      crestCode: 'RMA',
      defaultPreviewName: 'MBAPPE',
      defaultPreviewNumber: '9'
    }
  },
  {
    id: 'fcb-retro-1999',
    slug: 'barcelona-1999-centenary-retro-replica',
    name: 'Barcelona 1999 Centenary Heritage Retro Replica',
    team: 'FC Barcelona',
    countryOrLeague: 'Retro Vault · Club Heritage',
    category: 'retro',
    kitType: 'Retro',
    editionTier: 'Heritage Retro Replica',
    gender: 'Men',
    season: '1999/00',
    priceBdt: 1850,
    customPrintPriceBdt: 400,
    description:
      'Throwback 1999 centenary heritage replica with split deep garnet and midnight navy halves, black sleeves, and a structured fold-over polo collar. Heavyweight vintage pique feel. Unofficial retro tribute replica.',
    fabricSpec: '195 GSM Vintage Pique Knit Polyester · Embroidered Heritage Emblem',
    fitNote: 'Classic 90s boxy retro fit with generous sleeve width.',
    careInstructions: 'Gentle cold wash. Reshape collar while damp.',
    isActive: true,
    isDemo: true,
    featuredRank: 5,
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T09:00:00.000Z',
    variants: [
      { size: 'M', sku: 'JV-FCB99-M', priceBdt: 1850, stock: 6, isActive: true, chestInches: '40–41"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-FCB99-L', priceBdt: 1850, stock: 5, isActive: true, chestInches: '42–43"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-FCB99-XL', priceBdt: 1850, stock: 3, isActive: true, chestInches: '44–45"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#8B0032',
      secondaryColor: '#002B5C',
      accentColor: '#EDBB00',
      textColor: '#EDBB00',
      pattern: 'halves',
      collarStyle: 'polo',
      crestCode: 'FCB',
      defaultPreviewName: 'RIVALDO',
      defaultPreviewNumber: '10'
    }
  },
  {
    id: 'ger-home-2026',
    slug: 'germany-2026-home-fan-replica',
    name: 'Germany 2026 Home Classic Fan Replica Jersey',
    team: 'Germany',
    countryOrLeague: 'International · UEFA',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1350,
    customPrintPriceBdt: 350,
    description:
      'Clean architectural white fan replica shirt accented with a bold black chest chevron and subtle black-red-gold trim. Lightweight, breathable construction for everyday comfort. Replica supporter edition.',
    fabricSpec: '165 GSM AeroMesh 100% Breathable Polyester · Woven Badge',
    fitNote: 'Regular stadium fit.',
    careInstructions: 'Machine wash cold inside out.',
    isActive: true,
    isDemo: true,
    featuredRank: 6,
    createdAt: '2026-10-20T14:00:00.000Z',
    updatedAt: '2026-10-20T14:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-GER26-S', priceBdt: 1350, stock: 4, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-GER26-M', priceBdt: 1350, stock: 8, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-GER26-L', priceBdt: 1350, stock: 6, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-GER26-XL', priceBdt: 1350, stock: 3, isActive: true, chestInches: '43–44"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#F8FAFC',
      secondaryColor: '#111111',
      accentColor: '#DC2626',
      textColor: '#111111',
      pattern: 'sash',
      collarStyle: 'crew',
      crestCode: 'GER',
      defaultPreviewName: 'MUSIALA',
      defaultPreviewNumber: '10'
    }
  },
  {
    id: 'fra-away-2026',
    slug: 'france-2026-away-pinstripe-fan-replica',
    name: 'France 2026 Away Pinstripe Fan Replica Jersey',
    team: 'France',
    countryOrLeague: 'International · UEFA',
    category: 'national',
    kitType: 'Away',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1400,
    customPrintPriceBdt: 350,
    description:
      'Tailored chalk-white away fan replica jersey featuring fine cobalt and crimson vertical pinstripes and a ribbed crew collar. Sharp editorial silhouette suitable for both pitch and street wear. Replica supporter edition.',
    fabricSpec: '165 GSM Micro-Rib Polyester · Embroidered Crest',
    fitNote: 'Regular stadium fit.',
    careInstructions: 'Cold wash separately.',
    isActive: true,
    isDemo: true,
    featuredRank: 7,
    createdAt: '2026-10-19T11:00:00.000Z',
    updatedAt: '2026-10-19T11:00:00.000Z',
    variants: [
      { size: 'M', sku: 'JV-FRA26-M', priceBdt: 1400, stock: 7, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-FRA26-L', priceBdt: 1400, stock: 6, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-FRA26-XL', priceBdt: 1400, stock: 4, isActive: true, chestInches: '43–44"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#F8FAFC',
      secondaryColor: '#1D4ED8',
      accentColor: '#DC2626',
      textColor: '#1E3A8A',
      pattern: 'pinstripe',
      collarStyle: 'crew',
      crestCode: 'FRA',
      defaultPreviewName: 'GRIEZMANN',
      defaultPreviewNumber: '7'
    }
  },
  {
    id: 'esp-home-2026',
    slug: 'spain-2026-home-crimson-fan-replica',
    name: 'Spain 2026 La Roja Home Fan Replica Jersey',
    team: 'Spain',
    countryOrLeague: 'International · UEFA',
    category: 'national',
    kitType: 'Home',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2026',
    priceBdt: 1350,
    customPrintPriceBdt: 350,
    description:
      'Rich crimson red fan replica jersey with warm amber-gold shoulder and collar trim. Breathable side mesh panels help keep airflow high in warm weather. Unofficial supporter replica.',
    fabricSpec: '165 GSM AeroMesh Polyester · Woven Supporter Badge',
    fitNote: 'Regular stadium fit.',
    careInstructions: 'Wash cold with similar dark colors.',
    isActive: true,
    isDemo: true,
    featuredRank: 8,
    createdAt: '2026-10-18T11:00:00.000Z',
    updatedAt: '2026-10-18T11:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-ESP26-S', priceBdt: 1350, stock: 5, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-ESP26-M', priceBdt: 1350, stock: 9, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-ESP26-L', priceBdt: 1350, stock: 8, isActive: true, chestInches: '41–42"', lengthInches: '29"' }
    ],
    visual: {
      primaryColor: '#B91C1C',
      secondaryColor: '#991B1B',
      accentColor: '#F59E0B',
      textColor: '#FDE047',
      pattern: 'solid',
      collarStyle: 'crew',
      crestCode: 'ESP',
      defaultPreviewName: 'YAMAL',
      defaultPreviewNumber: '19'
    }
  },
  {
    id: 'acm-retro-2007',
    slug: 'milan-2007-athens-retro-replica',
    name: 'Milan 2007 Rossoneri Heritage Retro Replica',
    team: 'AC Milan',
    countryOrLeague: 'Retro Vault · Serie A Heritage',
    category: 'retro',
    kitType: 'Retro',
    editionTier: 'Heritage Retro Replica',
    gender: 'Men',
    season: '2006/07',
    priceBdt: 1900,
    customPrintPriceBdt: 400,
    description:
      'Iconic black-and-red vertical striped retro replica jersey featuring a structured white fold-over collar and gold trim details. Built from mid-weight heritage knit polyester. Unofficial retro replica.',
    fabricSpec: '190 GSM Heritage Knit Polyester · Embroidered Vintage Crest',
    fitNote: 'Classic regular fit.',
    careInstructions: 'Cold hand wash recommended.',
    isActive: true,
    isDemo: true,
    featuredRank: 9,
    createdAt: '2026-10-17T10:00:00.000Z',
    updatedAt: '2026-10-17T10:00:00.000Z',
    variants: [
      { size: 'M', sku: 'JV-ACM07-M', priceBdt: 1900, stock: 4, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-ACM07-L', priceBdt: 1900, stock: 6, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-ACM07-XL', priceBdt: 1900, stock: 2, isActive: true, chestInches: '43–44"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#111111',
      secondaryColor: '#DC2626',
      accentColor: '#FFFFFF',
      textColor: '#FFFFFF',
      pattern: 'stripes',
      collarStyle: 'polo',
      crestCode: 'ACM',
      defaultPreviewName: 'KAKA',
      defaultPreviewNumber: '22'
    }
  },
  {
    id: 'ars-third-2526',
    slug: 'north-london-25-26-forest-third-replica',
    name: 'North London 25/26 Forest Green Third Fan Replica',
    team: 'Arsenal FC',
    countryOrLeague: 'Club · England',
    category: 'club',
    kitType: 'Third',
    editionTier: 'Fan Replica',
    gender: 'Unisex',
    season: '2025/26',
    priceBdt: 1450,
    customPrintPriceBdt: 350,
    description:
      'Bottle-green and navy-shouldered third kit fan replica with crisp off-white polo collar trim. Pairs classic terrace aesthetics with lightweight moisture-wicking fabric. Unofficial fan replica.',
    fabricSpec: '165 GSM Pique-Weave Breathable Polyester · Woven Minimalist Crest',
    fitNote: 'Regular stadium fit.',
    careInstructions: 'Machine wash cold inside out.',
    isActive: true,
    isDemo: true,
    featuredRank: 10,
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
    variants: [
      { size: 'S', sku: 'JV-ARS26-S', priceBdt: 1450, stock: 5, isActive: true, chestInches: '37–38"', lengthInches: '27"' },
      { size: 'M', sku: 'JV-ARS26-M', priceBdt: 1450, stock: 9, isActive: true, chestInches: '39–40"', lengthInches: '28"' },
      { size: 'L', sku: 'JV-ARS26-L', priceBdt: 1450, stock: 7, isActive: true, chestInches: '41–42"', lengthInches: '29"' },
      { size: 'XL', sku: 'JV-ARS26-XL', priceBdt: 1450, stock: 4, isActive: true, chestInches: '43–44"', lengthInches: '30"' }
    ],
    visual: {
      primaryColor: '#14532D',
      secondaryColor: '#1E293B',
      accentColor: '#F7F7F5',
      textColor: '#F7F7F5',
      pattern: 'hoops',
      collarStyle: 'polo',
      crestCode: 'AFC',
      defaultPreviewName: 'SAKA',
      defaultPreviewNumber: '7'
    }
  }
];
