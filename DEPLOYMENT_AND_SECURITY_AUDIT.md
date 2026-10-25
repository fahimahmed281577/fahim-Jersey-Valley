# Jersey Valley — Production-Readiness & Security Audit Report

## 1. Feature & Security Audit Matrix

| Area / Feature | Status | Verification & Notes |
| --- | --- | --- |
| **Storefront, Catalog, Search, Filters, Size Guide & Custom Print Preview** | **Fully Implemented & Verified** | 8 curated football jerseys (National, Club, Retro), size-specific stock (`S`–`XXL`), live front/back SVG customizer, BDT (`৳`) integer pricing, and responsive layout verified in headless Chromium at `1440×900` and `390×844`. |
| **Server-Side Checkout Calculation & Atomic COD Order Placement** | **Fully Implemented & Verified** | `POST /api/orders` recalculates all unit prices, custom print fees (`+৳350`/`+৳400`), coupons (`VALLEY10`, `DHAKA60`, ` SUPPORTER150`), and Inside/Outside Dhaka shipping on the server. Validates `Division -> District -> Upazila` against `BANGLADESH_DIVISIONS`, enforces `idempotencyKey` + in-flight lock, deducts variant stock atomically, and generates non-sequential order numbers (`JV-2610-<HEX>`). |
| **Order Privacy & Anti-Enumeration (IDOR Protection)** | **Fully Implemented & Verified** | `GET /api/orders/:orderNumber` and `POST /api/orders/:orderNumber/cancel` require customer ownership proof (matching 11-digit Bangladesh mobile number, post-checkout `orderAccessToken`, or verified Firebase Bearer token). `GET /api/customer/orders` strictly requires a verified Firebase Bearer token. |
| **Server-Validated Administrator Authorization (RBAC)** | **Fully Implemented & Verified** | Hardcoded email checks (`chalantika07@gmail.com`) have been completely removed from `firestore.rules`, `server.ts`, and frontend code. Admin writes (`PATCH /api/admin/*`) and Firestore rules require a cryptographically verified Firebase ID token (`RS256` verified against Google SecureToken X.509 certificates) with `email_verified == true` AND an admin grant via `/admins/{uid}`, `ADMIN_UIDS` env var, or `admin: true` custom claim. |
| **Cloud Firestore Security Rules (`firestore.rules`)** | **Deployed & Verified Against Live Cloud Firestore** | Linted (`npx eslint firestore.rules` = 0 errors), deployed to project `circular-valve-x3kqt` (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`), and tested via live Firebase SDK calls proving `permission-denied` on unauthorized reads/writes. |
| **Firebase Authentication (Google OAuth & Email/Password)** | **Implemented (Email/Password requires Firebase Console toggle)** | Google Sign-In and Email/Password flows are wired in `StoreContext.tsx` and `AccountPage.tsx`. If Email/Password is not enabled in the Firebase Console, the UI catches `auth/operation-not-allowed` and displays clear setup instructions. |
| **bKash & Nagad Online Merchant Gateways** | **Modular Guard Implemented (Requires Merchant Secrets)** | Fake payment success is strictly prohibited. Checkout and `POST /api/orders` block online gateway orders until `BKASH_*` / `NAGAD_*` merchant credentials are configured, guiding customers to the active Cash on Delivery (`COD`) workflow. |
| **Sample / Demonstration Data Separation** | **Fully Implemented & Verified** | The single demonstration order (`JV-DEMO-0001`) carries `isDemoOrder: true`, uses explicit non-person placeholder labels (`Sample Customer (Demonstration Record)`, `01700000000`), and is excluded from real revenue/order metrics in `/api/admin/overview`. |

---

## 2. How to Configure the First Administrator Securely

Administrator privileges are **never** granted by client-supplied fields or hardcoded email strings. You can provision the first administrator using any of the three server-verified mechanisms below:

### Option A: Environment Variable (`ADMIN_UIDS`) — Fastest for Cloud Run / AI Studio Secrets
1. Sign in to the Jersey Valley storefront (`/account`) with your verified Google or Email account.
2. Copy your Firebase Auth **UID** displayed on the `/admin` or `/account` page.
3. Set `ADMIN_UIDS="<YOUR_FIREBASE_UID>"` in the environment secrets and restart the server.

### Option B: Cloud Firestore `/admins/{uid}` Collection (Enforced by both `firestore.rules` and `server.ts`)
1. Open the **Firebase Console → Firestore Database** (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`).
2. Create a document in the `admins` collection where the **Document ID** is the administrator's Firebase Auth `uid`:
   ```json
   {
     "uid": "<YOUR_FIREBASE_UID>",
     "email": "admin@yourdomain.com",
     "role": "admin",
     "createdAt": "2026-10-25T00:00:00.000Z"
   }
   ```
3. Because `firestore.rules` sets `allow write: if isAdmin();` on `/admins/{adminUid}`, no standard user can self-create this document from the client; the first admin document must be created via the Firebase Console or Firebase Admin SDK.

### Option C: Firebase Custom Claims (`admin: true`)
Use the Firebase Admin SDK in a secure one-off script:
```ts
await getAuth().setCustomUserClaims(targetUid, { admin: true });
```

---

## 3. Executed Test Suites vs. Local JVM Emulator Note

1. **Pure Commerce & State-Machine Unit Tests (`src/lib/commerce.test.ts`)**:
   - **Executed & Passed (6/6)** via `npx tsx --test src/lib/commerce.test.ts`.
2. **Cryptographic Firebase JWT & Admin RBAC Unit Tests (`src/lib/serverAuth.test.ts`)**:
   - **Executed & Passed (3/3)** via `npx tsx --test src/lib/serverAuth.test.ts`. Tests real `RS256` signature verification, issuer/audience/expiry validation, tamper rejection, and `checkIsServerAdmin`.
3. **Live Cloud Firestore Rules & Backend API Security Tests (`firestore.rules.test.ts`)**:
   - **Executed & Passed** via `npx tsx --test firestore.rules.test.ts`.
   - Executes real client SDK operations against the deployed Cloud Firestore database (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`) confirming `permission-denied` on unauthenticated `/users/{uid}/private/shipping` reads, `/products` tampering, `/admins` self-promotion, and `/orders` reads.
   - Executes live HTTP requests against `createJerseyValleyApp()` verifying `401` on unauthenticated `PATCH /api/admin/*` and `GET /api/customer/orders`, `400` on invalid Bangladesh `Division/District/Upazila` combinations, `200` idempotent replay deduplication, and `403` on unauthorized third-party order lookup/cancellation.
4. **Local Firebase Java Emulator Note**:
   - `firebase.json` is configured for the Firestore Emulator (`127.0.0.1:8080`). In this container environment, a local Java runtime (`java` / OpenJDK) is not installed, so local JVM emulator processes cannot be spawned inside the container; instead, rules were linted with `@firebase/rules-unit-testing` ESLint rules, deployed directly to Cloud Firestore, and verified against the live Firebase backend.
