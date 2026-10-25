# Jersey Valley — Production-Readiness, Durable Serverless Persistence & Vercel Deployment Guide

## 1. Vercel Deployment Architecture & Durable Firestore Persistence

The project runs both the **Vite React SPA frontend** and the **Express API backend** on Vercel with **durable, concurrency-safe Cloud Firestore persistence**:

1. **Static Frontend (`dist/`)**: Built via `npm run build` (`vite build`) and served from Vercel's Edge CDN.
2. **Serverless API Adapter (`/api/index.ts`)**: Exports a Vercel Node Serverless Function handler that initializes and caches `createJerseyValleyApp()` from `/server.ts`. Lookups to `vite` are dynamically loaded only in local development (`process.env.NODE_ENV !== 'production'`), so production Serverless Functions never bundle Vite.
3. **Durable Server-Side Persistence (`/src/lib/persistentStore.ts`)**:
   - When configured with Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`), `/server.ts` uses `FirestoreAdminPersistenceAdapter` (`firebase-admin/firestore`) connected to the named Cloud Firestore database (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`).
   - All order placements, idempotency checks, variant stock deductions, order cancellations/stock restorations, and admin setting updates execute inside **atomic Firestore transactions (`db.runTransaction`)** across server-only collections (`/serverOrders/{orderNumber}`, `/serverCatalog/{productId}`, `/serverIdempotency/{idempotencyKey}`, and `/siteSettings/global`).
   - Because `firestore.rules` enforces a strict global default-deny (`match /{document=**} { allow read, write: if false; }`), `/serverOrders`, `/serverCatalog`, and `/serverIdempotency` are completely inaccessible to client SDKs (`orderAccessToken` and guest PII are never exposed to direct browser queries), while remaining shared across all Vercel Serverless Function instances and cold starts.
   - In local development or automated tests where service-account credentials are not set, `createDefaultPersistenceAdapter()` falls back to `TransactionalStoreAdapter` (with mutex-serialized transactions and optional disk snapshot persistence via `PERSISTENT_STORE_FILE_PATH`).

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

All variables below were identified directly from `/src/lib/persistentStore.ts`, `/src/lib/serverAuth.ts`, `/server.ts`, and `/src/lib/firebase.ts`.

| Variable Name | Scope | Required on Vercel? | Purpose | Where to Obtain Value |
| --- | --- | --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Server-only** (Never `VITE_`) | **Required for durable Firestore persistence** (or use `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`) | Full Firebase Service Account JSON (raw single-line JSON or base64-encoded) used by `firebase-admin` to run atomic Firestore transactions across serverless cold starts. | **Firebase Console → Project Settings → Service accounts → Generate new private key**. |
| `FIREBASE_CLIENT_EMAIL` | **Server-only** (Never `VITE_`) | Alternative to `FIREBASE_SERVICE_ACCOUNT_JSON` | `client_email` field from the Firebase Service Account JSON when configuring key fields separately. | Inside downloaded Service Account JSON (`client_email`). |
| `FIREBASE_PRIVATE_KEY` | **Server-only** (Never `VITE_`) | Alternative to `FIREBASE_SERVICE_ACCOUNT_JSON` | `private_key` PEM string from the Firebase Service Account JSON (`\n` escaped newlines are automatically normalized). | Inside downloaded Service Account JSON (`private_key`). |
| `ADMIN_UIDS` | **Server-only** | **Recommended** | Comma-separated Firebase Auth `uid` values granted server-side Administrator RBAC on `/api/admin/*` (requires `email_verified == true`). | Sign in at `/account`, copy the displayed Firebase `UID`, or check **Firebase Console → Authentication → Users**. |
| `APP_URL` | **Server-only** | Optional | Canonical base URL for `/sitemap.xml` and `/robots.txt` (auto-falls back to Vercel's `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`). | Your custom domain or `https://<project>.vercel.app`. |
| `FIREBASE_PROJECT_ID` | **Server-only** | Optional (defaults to `firebase-applet-config.json`) | Expected Firebase project ID (`circular-valve-x3kqt`) used by `verifyFirebaseIdToken` and `firebase-admin`. | **Firebase Console → Project Settings → General → Project ID** (`circular-valve-x3kqt`). |
| `FIREBASE_FIRESTORE_DATABASE_ID` | **Server-only** | Optional (defaults to `firebase-applet-config.json`) | Named Cloud Firestore database ID (`ai-studio-jerseyvalleyfoot-e1da97d7-8072-4f35-96cb-8232f6c69bd4`). | **Firebase Console → Firestore Database**. |
| `VITE_FIREBASE_PROJECT_ID` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Client-side Firebase project ID override. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_APP_ID` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Client-side Firebase Web App ID override. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_API_KEY` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Public Firebase Web API Key for client Auth & Firestore SDK. | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Firebase Auth domain (`circular-valve-x3kqt.firebaseapp.com`). | **Firebase Console → Project Settings → Your apps (Web)**. |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Named Firestore Database ID for client SDK. | **Firebase Console → Firestore Database**. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Firebase Storage bucket name. | **Firebase Console → Storage**. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client (`VITE_`) | Optional (defaults to `firebase-applet-config.json`) | Firebase Cloud Messaging Sender ID. | **Firebase Console → Project Settings → Cloud Messaging**. |
| `BKASH_APP_KEY`, `BKASH_APP_SECRET`, `BKASH_USERNAME`, `BKASH_PASSWORD` | **Server-only** | Optional (Required only for live bKash PGW) | Enables `bkashMerchantEnabled` in `/server.ts` for bKash Tokenized Checkout. Leave unset to keep Cash on Delivery (`COD`) as the active checkout workflow. | Official **bKash Merchant / PGW Portal** after merchant onboarding. |
| `NAGAD_MERCHANT_ID`, `NAGAD_PG_PUBLIC_KEY`, `NAGAD_MERCHANT_PRIVATE_KEY` | **Server-only** | Optional (Required only for live Nagad PGW) | Enables `nagadMerchantEnabled` in `/server.ts` for Nagad PGW. Leave unset to keep Cash on Delivery (`COD`) as the active checkout workflow. | Official **Nagad Merchant PGW Portal** after merchant onboarding. |

---

## 3. How to Configure Firebase Admin Credentials Securely on Vercel

1. Open **Firebase Console** (`https://console.firebase.google.com`) → select project **`circular-valve-x3kqt`**.
2. Navigate to **Project Settings (gear icon) → Service accounts**.
3. Click **Generate new private key** and download the `.json` file to a secure local folder outside your Git repository (never commit this file).
4. In **Vercel Dashboard → Your Project → Settings → Environment Variables**:
   - **Recommended (Single Variable)**: Add `FIREBASE_SERVICE_ACCOUNT_JSON` for **Production, Preview, and Development** environments and paste the entire contents of the downloaded JSON file (or its base64 string).
   - **Alternative (Split Variables)**: Add `FIREBASE_CLIENT_EMAIL` (set to the `client_email` field) and `FIREBASE_PRIVATE_KEY` (set to the `private_key` field).
   - **Security Rule**: Never prefix these variables with `VITE_`. Only variables prefixed with `VITE_` are exposed to the client bundle by Vite.
5. Also in **Firebase Console → Authentication → Settings → Authorized domains**, add your Vercel deployment domain (e.g., `your-project.vercel.app`) so Google Sign-In works in production.
