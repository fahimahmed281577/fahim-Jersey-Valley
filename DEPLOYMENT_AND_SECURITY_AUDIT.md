# Jersey Valley — Production-Readiness, Security Audit & Vercel Deployment Guide

## 1. Vercel Deployment Architecture

The project is configured to run both the **Vite React SPA frontend** and the **Express API backend** on Vercel without a persistent container:

1. **Static Frontend (`dist/`)**: Built via `npm run build` (`vite build`) and served from Vercel's Edge CDN.
2. **Serverless API Adapter (`/api/index.ts`)**: Exports a Vercel Node Serverless Function handler that initializes and caches `createJerseyValleyApp()` from `/server.ts`. Lookups to `vite` are dynamically loaded only in local development (`process.env.NODE_ENV !== 'production'`), so production Serverless Functions never bundle Vite.
3. **Routing & Rewrites (`/vercel.json`)**:
   - `/api/(.*)` → `/api/index`
   - `/robots.txt` & `/sitemap.xml` → `/api/index`
   - `/((?!api/|assets/|robots\\.txt|sitemap\\.xml|.*\\..*).* )` → `/index.html` (React Router SPA fallback)

### Exact Vercel Build & Output Settings

| Setting | Value |
| --- | --- |
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` (Repository Root) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Node.js Version** | `20.x` or `22.x` |

---

## 2. Environment Variables Reference

All variables below were identified directly from `/server.ts`, `/src/lib/serverAuth.ts`, and `/src/lib/firebase.ts`.

| Variable Name | Scope | Required? | Purpose | Where to Obtain Value |
| --- | --- | --- | --- | --- |
| `ADMIN_UIDS` | Server-only | **Recommended** | Comma-separated Firebase Auth `uid` values granted server-side Administrator RBAC on `/api/admin/*` (requires `email_verified == true`). | Sign in at `/account`, copy the displayed Firebase `UID`, or check **Firebase Console → Authentication → Users**. |
| `APP_URL` | Server-only | Optional | Canonical base URL for `/sitemap.xml` and `/robots.txt` (auto-falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`). | Your custom domain or `https://<project>.vercel.app`. |
| `FIREBASE_PROJECT_ID` | Server-only | Optional (falls back to `firebase-applet-config.json`) | Expected Firebase project ID (`circular-valve-x3kqt`) used by `verifyFirebaseIdToken` to validate JWT `iss` and `aud` claims. | **Firebase Console → Project Settings → General → Project ID** (`circular-valve-x3kqt`). |
| `FIREBASE_FIRESTORE_DATABASE_ID` | Server-only | Optional (falls back to `firebase-applet-config.json`) | Named Cloud Firestore database ID queried by `checkIsServerAdmin` (`/admins/{uid}`). | **Firebase Console → Firestore Database** (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`). |
| `VITE_FIREBASE_PROJECT_ID` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Client-side Firebase project ID override. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_APP_ID` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Client-side Firebase Web App ID override. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_API_KEY` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Public Firebase Web API Key for client Auth & Firestore SDK. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Firebase Auth domain (`circular-valve-x3kqt.firebaseapp.com`). | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Named Firestore Database ID for client SDK. | **Firebase Console → Firestore Database**. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Firebase Storage bucket name. | **Firebase Console → Storage**. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client (`VITE_`) | Optional (falls back to `firebase-applet-config.json`) | Firebase Cloud Messaging Sender ID. | **Firebase Console → Project Settings → Cloud Messaging**. |
| `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` | Server-only | Optional (Required only for live bKash PGW) | Enables `bkashMerchantEnabled` in `/server.ts` for bKash Tokenized Checkout. Leave unset to keep Cash on Delivery (`COD`) as the active checkout workflow. | Official **bKash Merchant / PGW Portal** after merchant onboarding. |
| `NAGAD_MERCHANT_ID`, `NAGAD_PG_PUBLIC_KEY`, `NAGAD_MERCHANT_PRIVATE_KEY` | Server-only | Optional (Required only for live Nagad PGW) | Enables `nagadMerchantEnabled` in `/server.ts` for Nagad PGW. Leave unset to keep Cash on Delivery (`COD`) as the active checkout workflow. | Official **Nagad Merchant PGW Portal** after merchant onboarding. |

---

## 3. Required Firebase Console Configuration Before Going Live on Vercel

1. **Authorized Domains for Firebase Authentication (Critical for Google Sign-In on Vercel)**:
   - Open **Firebase Console → Authentication → Settings → Authorized domains** for project `circular-valve-x3kqt`.
   - Add your Vercel production domain (e.g., `your-project.vercel.app` and any custom domain such as `jerseyvalley.com.bd`). Without this, `signInWithPopup` (Google Sign-In) will fail with `auth/unauthorized-domain` on the deployed Vercel URL.
2. **Enable Sign-In Providers**:
   - Under **Firebase Console → Authentication → Sign-in method**, ensure **Google** and **Email/Password** are enabled.
3. **Provision Your First Administrator**:
   - Either add your verified Firebase User `UID` to the `ADMIN_UIDS` environment variable in Vercel, **or** create a document at `/admins/<YOUR_UID>` in Cloud Firestore (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`) with `{ "uid": "<YOUR_UID>", "email": "<YOUR_EMAIL>", "createdAt": <Timestamp> }`.

---

## 4. Production Considerations & Remaining Blockers

1. **Serverless Ephemeral Memory vs. Persistent Backend Store**:
   - Authenticated customers' orders, profiles (`/users/{uid}`), shipping addresses (`/users/{uid}/private/shipping`), and wishlists (`/users/{uid}/wishlist/{id}`) are persisted directly to **Cloud Firestore** (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`) and protected by `firestore.rules`.
   - However, `/server.ts` currently holds guest orders (`ordersStore`), runtime variant stock deductions (`catalogStore`), and runtime shipping rate edits (`siteSettingsStore`) in Node process memory. On Vercel Serverless Functions, process memory is preserved across warm invocations of the same lambda instance but resets on cold starts or horizontal scaling across multiple instances.
   - **Recommendation for High-Traffic Production**: Connect `/server.ts` to a persistent database (or Firebase Admin SDK with a service account / Firestore REST API) so guest orders and admin stock/setting mutations persist across serverless cold starts.
2. **bKash & Nagad Merchant APIs**:
   - Currently guarded in `COD`-first mode (`bkashMerchantEnabled: false`, `nagadMerchantEnabled: false` unless merchant env vars are provided). Implementing the full redirect/callback handshake requires live sandbox/production credentials from bKash and Nagad.
