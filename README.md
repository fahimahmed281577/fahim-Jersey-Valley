# Jersey Valley — Football Jersey E-Commerce Platform for Bangladesh

Jersey Valley is a full-stack football jersey e-commerce platform built for supporters across all 8 divisions of Bangladesh. It sells **Fan Replica**, **Player-Fit Replica**, and **Heritage Retro Replica** jerseys with optional custom player name and squad number printing, Bangladeshi Taka (`BDT` / `৳`) pricing, nationwide **Cash on Delivery (COD)**, and modular interfaces for **bKash** and **Nagad**.

---

## 1. Architecture Overview

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Router, Lucide React
- **Authentication & Cloud Database**: Firebase Authentication (Google Sign-In + Email/Password) & Cloud Firestore (`firebase-applet-config.json`)
- **Zero-Trust Security Rules**: `firestore.rules` (validated with `@firebase/eslint-plugin-security-rules` and 12 adversarial unit tests in `firestore.rules.test.ts`)
- **Trusted Backend Server**: Express (`server.ts`) handling authoritative price calculation, coupon validation, atomic size-variant inventory deduction, idempotent order creation, COD status workflow, and dynamic SEO (`sitemap.xml` and `robots.txt`).
- **Pure Business Logic & Unit Tests**: `src/lib/commerce.ts` + `src/lib/commerce.test.ts`

---

## 2. Firestore Schema (`firebase-blueprint.json`)

- `/users/{userId}`: Public/non-sensitive customer profile (`uid`, `displayName`, `favoriteTeam`, `createdAt`, `updatedAt`).
- `/users/{userId}/private/{docId}`: Isolated PII subcollection (`email`, Bangladesh `phone`, `division`, `district`, `upazila`, `streetAddress`, `postalCode`) accessible strictly by `isOwner(userId)` or `isAdmin()`.
- `/users/{userId}/wishlist/{itemId}`: Customer saved wishlist jerseys.
- `/admins/{adminUid}`: Trusted administrator lookup collection.
- `/products/{productId}`: Football jersey catalog collection.
- `/orders/{orderId}`: Customer order documents with terminal state locking (`DELIVERED` / `CANCELLED`) and separate `orderStatus` vs `paymentStatus`.
- `/siteSettings/{settingId}`: Configurable Inside/Outside Dhaka shipping rates, free shipping threshold, and announcement banner.
- `/newsletterSubscriptions/{subId}`: Consent-verified newsletter subscriptions.

---

## 3. Running & Testing

```bash
# Run pure commerce unit tests
npx --yes tsx --test src/lib/commerce.test.ts

# Lint and test Firestore security rules
npx eslint firestore.rules
npx --yes tsx --test firestore.rules.test.ts

# Start development server (Express + Vite on port 3000)
npm run dev

# Build production bundle
npm run build
```
