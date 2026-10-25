# Jersey Valley — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Sources of Truth

1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **PII Split-Collection Isolation**:
   - `/users/{userId}` holds only non-sensitive profile display metadata (`uid`, `displayName`, `favoriteTeam`, `createdAt`, `updatedAt`).
   - `/users/{userId}/private/{docId}` holds PII (`email`, Bangladesh `phone`, `division`, `district`, `upazila`, `streetAddress`, `postalCode`) and is strictly readable/writable ONLY by `isOwner(userId)` or `isAdmin()`, and requires parent `/users/{userId}` existence (`Master Gate`).
3. **Zero Self-Assigned Admin Privilege**:
   - Admin status is determined exclusively via `isAdmin()` checking either the `/admins/$(request.auth.uid)` document or the bootstrapped runtime owner email (`chalantika07@gmail.com`) with `request.auth.token.email_verified == true`.
   - Clients can never write to `/admins/{adminUid}` to promote themselves unless already `isAdmin()`.
4. **Catalog & Site Settings Integrity**:
   - `/products/{productId}` and `/siteSettings/{settingId}` are publicly readable (`get`, `list` where `isActive == true` for products) so customers can browse the storefront, but write operations (`create`, `update`, `delete`) are strictly restricted to `isAdmin()` with full `isValidProduct` / `isValidSiteSettings` schema validation.
5. **Order Creation, Payment Immutability & Terminal State Locking**:
   - Customers (`isSignedIn()` + `email_verified == true`) can create an `/orders/{orderId}` document ONLY for themselves (`incoming().userId == request.auth.uid`), with `paymentStatus == 'UNPAID_COD'` (for COD) or `'PENDING_VERIFICATION'`, and `orderStatus == 'PENDING_CONFIRMATION'`. Customers can NEVER create or update an order with `paymentStatus == 'VERIFIED'`.
   - Once `orderStatus` reaches a terminal state (`'DELIVERED'` or `'CANCELLED'`), non-admin updates are permanently locked;customers may only cancel their own order while `existing().orderStatus == 'PENDING_CONFIRMATION'`.
   - `allow list` on `/orders` enforces `resource.data.userId == request.auth.uid || isAdmin()` so no client can scrape another customer's orders.
6. **Temporal & Key Strictness**:
   - Every `create` requires `incoming().createdAt == request.time` and `hasAll` + `hasOnly` key checks.
   - Every `update` requires `isValid[Entity](incoming())`, `incoming().createdAt == existing().createdAt`, `incoming().updatedAt == request.time`, and action-scoped `affectedKeys().hasOnly(...)`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Shadow Privilege Field on User Profile)**: `POST /users/u1` with `{ uid: "u1", displayName: "Rahim", isAdmin: true, createdAt: SERVER_TIME, updatedAt: SERVER_TIME }` -> Rejected by `hasOnly()`.
2. **Payload 2 (Cross-User PII Read)**: Authenticated user `u2` calls `GET /users/u1/private/info` -> Rejected by `isOwner(userId) || isAdmin()`.
3. **Payload 3 (Orphaned Subcollection Write)**: User `u1` writes `/users/u1/wishlist/w1` when `/users/u1` does not exist -> Rejected by Master Gate `exists(/databases/$(database)/documents/users/$(userId))`.
4. **Payload 4 (Fake Paid Order Creation)**: User `u1` creates `/orders/o1` with `paymentStatus: "VERIFIED"` -> Rejected by initial state gate requiring `paymentStatus in ['UNPAID_COD', 'PENDING_VERIFICATION']`.
5. **Payload 5 (Order Price Tampering on Update)**: User `u1` updates `/orders/o1` changing `totalBdt: 10` -> Rejected by `affectedKeys().hasOnly(['orderStatus', 'updatedAt'])`.
6. **Payload 6 (Terminal State Re-opening)**: User `u1` updates `/orders/o1` from `DELIVERED` to `CANCELLED` -> Rejected by terminal state lock (`existing().orderStatus == 'PENDING_CONFIRMATION'`).
7. **Payload 7 (Order List Scraping)**: User `u1` runs un-filtered `list` on `/orders` -> Rejected by `allow list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin())`.
8. **Payload 8 (Admin Email Spoofing without Verification)**: User with `email: "chalantika07@gmail.com"` and `email_verified: false` attempts `create` on `/products/p1` -> Rejected by `request.auth.token.email_verified == true`.
9. **Payload 9 (Denial-of-Wallet 1MB String Injection)**: User `u1` updates `displayName` with a 5,000-char string -> Rejected by `data.displayName.size() <= 80`.
10. **Payload 10 (ID Poisoning)**: User `u1` creates document with ID containing spaces/slashes or >128 chars -> Rejected by `isValidId()`.
11. **Payload 11 (Immortal Field Mutation)**: User `u1` updates `/users/u1` with a modified `createdAt` or `uid` -> Rejected by `incoming().createdAt == existing().createdAt && incoming().uid == existing().uid`.
12. **Payload 12 (Invalid Bangladesh Phone Format in Order)**: User `u1` creates `/orders/o1` with `customerPhone: "12345"` -> Rejected by regex `^(\\+?880|0)1[3-9][0-9]{8}$`.
