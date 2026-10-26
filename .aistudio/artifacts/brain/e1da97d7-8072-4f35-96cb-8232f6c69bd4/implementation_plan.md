# Implementation Plan: Jersey Valley Clean Astro 7 & Lumos Rebuild

---

## 1. Executive Summary & User Alignment

Based on the discovery interview, the user has established a clear strategic roadmap:
* **Framework Architecture:** Full clean rebuild using **Astro 7** and the **Lumos Framework** from scratch.
* **Core Market & Offering:** Premium replica and fan football jerseys engineered specifically for football supporters across all 8 divisions of Bangladesh.
* **Content & Catalog Engine (CMS):** A modern, WordPress-grade e-commerce CMS architecture—providing visual product authoring, variant inventory matrices, media management, drop scheduling, and coupon rules without legacy PHP overhead.
* **Visual & Brand Direction:** **High-energy athletic streetwear aesthetic** inspired by modern football drops (Nike Lab / Adidas Terrex & Spezial style, brutalist grid lines, oversized typographic stamps, deep carbon and pitch emerald accents).
* **Asset Strategy:** Photorealistic invisible ghost-mannequin photography paired with an automated **Responsive Images System** (AVIF + WebP + multi-resolution `srcset`).

---

## 2. Deep Research: Designing the Ideal E-Commerce CMS for Astro 7

WordPress + WooCommerce became the global standard for e-commerce content management because of specific usability principles. We adapt those strengths into a modern, high-speed, type-safe headless architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WordPress-Grade Headless Studio                      │
│                                                                        │
│  [Products & Variants]    [Media Library & Crop]   [Matchday Drops]    │
│  [Order Desk (COD/bKash)] [Coupon Engine]          [Supporter CRM]     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Live Sync / Webhooks
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Cloud Firestore Hub (jerseyvalley-bd)               │
│                                                                        │
│  Collections: /products, /categories, /drops, /orders, /coupons, /meta │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Native Type-Safe Server Queries
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Astro 7 Frontend + Lumos Reactive Islands                │
│                                                                        │
│  Zero-JS Static Layouts + Selective React Islands (Cart, Bag, Custom)  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key CMS Capabilities to Deliver:
1. **Visual Variant & Size Matrix:**
   * Instant stock editing for all sizes (`S`, `M`, `L`, `XL`, `XXL`) on a single view, with low-stock warnings and SKU generator.
2. **Media Manager with Responsive Generation:**
   * Drag-and-drop image uploads with automatic responsive resizing (400w, 800w, 1024w) and multi-format encoding (AVIF + WebP + JPEG).
3. **Matchday Drops & Campaign Curator:**
   * Schedule time-limited kit drops (e.g., "World Cup 2026 Batch #1", "Retro Centenary Vault") with countdown timers and featured collection flags.
4. **Bangladesh-Optimized Order Desk:**
   * Explicit separation of COD confirmation, bKash/Nagad merchant verification, fulfillment status, and customer phone lookups.
5. **Editorial Fan Stories:**
   * Matchday articles and kit history journals for content marketing and organic search authority in Bangladesh.

---

## 3. High-Energy Athletic Streetwear Visual Identity

* **Palette Tokens:**
  * Background Canvas: Carbon Deep Black (`#0A0A0A` / `--dark-900`) and Warm Off-White (`#F7F7F5` / `--light-200`) for high-contrast contrast blocks.
  * Pitch Accent: Electrifying Stadium Emerald (`#10B981` / `#15803D`) and Laser Volt Green (`#22C55E`).
  * Contrast Hairlines: 1px geometric grid dividers (`rgba(255, 255, 255, 0.08)` and `rgba(0, 0, 0, 0.08)`).
* **Typography Hierarchy:**
  * Display Headlines: `Barlow Condensed` / `Impact` in tight uppercase leading (`--line-height-tight: 1.05`).
  * Data & Metrics: `JetBrains Mono` for squad numbers, pricing in BDT (`৳`), fabric specs, and drop coordinates.
  * Body Text: `Plus Jakarta Sans` for clean, modern editorial legibility.
* **Layout Discipline:**
  * Asymmetric brutalist streetwear grids, oversized squad number watermarks (`#10`, `#7`), diagonal barcode tags, and technical coordinates (`DHAKA // 23.8103° N`).
  * Zero generic rounded card pill enclosures; clean, unboxed typography with high-contrast tactile borders.

---

## 4. Responsive Images System Implementation

Using the 10 newly generated photorealistic jersey assets from the user's archive:

1. **Format & Variant Pipeline:**
   * **Source:** High-resolution 1024×1024 master assets.
   * **Target Widths:**
     * `400w` for mobile feeds & cart line item drawers.
     * `800w` for standard 2-column & 3-column catalog grids.
     * `1024w` for full-width PDP galleries and modal zooms.
   * **Target Codecs:**
     * `image/avif` (quality 80) — ~50% bandwidth reduction.
     * `image/webp` (quality 85) — universal modern browser speed.
     * `image/jpeg` (quality 88 mozjpeg) — fallback.
2. **Component Abstractions:**
   * `<ResponsiveImage.astro>`: Native Astro component for server-rendered catalog and hero showcases.
   * `<ResponsiveImage.tsx>`: React island equivalent for client-interactive sliders and modal zoom views.
   * Guarantees: Explicit `width="1024" height="1024"`, `aspect-ratio: 1/1` to ensure **Cumulative Layout Shift (CLS) = 0**, `loading="lazy"`, `decoding="async"`, and `referrerPolicy="no-referrer"`.

---

## 5. Phased Execution Roadmap

### Phase 1: Image Processing & Responsive Asset Generation
* Run `sharp` processing script to create all 10 jerseys in 400w, 800w, and 1024w in AVIF, WebP, and JPG formats under `/public/images/products/`.
* Connect canonical images to `INITIAL_CATALOG` in `src/data/catalog.ts`.

### Phase 2: Astro 7 Storefront Rebuild with Lumos Primitives
* Create Astro-native routes:
  * `/src/pages/index.astro`: High-energy streetwear hero, matchday kit drop banner, responsive jersey grid, thermal print interactive preview.
  * `/src/pages/shop/index.astro`: Catalog grid with Lumos filters (National, Club, Retro, Player Fit).
  * `/src/pages/product/[slug].astro`: Dynamic Product Detail Page with responsive multi-view gallery, size matrix selector, and live back-print customizer.
  * `/src/pages/cart.astro` & `/src/pages/checkout.astro`: Full COD and bKash order workflows.

### Phase 3: WordPress-Grade E-Commerce CMS Studio
* Build `/src/pages/admin/cms.astro` and companion admin components:
  * Product variant editor (stock & prices).
  * Responsive Media Gallery browser.
  * Order status pipeline & dispatch desk.
  * Coupon and discount rule manager.
* Direct live binding with Cloud Firestore (`jerseyvalley-bd`) with resilient in-memory fallback.

### Phase 4: Verification, Quality Assurance & Deployment Readiness
* Run `npx tsx --test` across all commerce, auth, cart, and responsive image test suites.
* Execute Playwright browser verification at 360px, 390px, 768px, 1024px, and 1440px viewports.
* Verify zero CLS, WCAG AA contrast, and sub-second page loads.

---

## 6. Verification Checklist

- [ ] All 10 photorealistic jersey assets generated in AVIF, WebP, and JPG at 400w, 800w, and 1024w.
- [ ] Responsive `<picture>` elements render with correct `srcset` and zero CLS.
- [ ] Astro 7 SSR development server operates cleanly on port 3000.
- [ ] High-energy streetwear typography and Lumos tokens applied across all views.
- [ ] Live Cloud Firestore persistence (`jerseyvalley-bd`) connected for orders, inventory, and CMS updates.
- [ ] Cash on Delivery (COD) and bKash/Nagad configuration workflows verified.
