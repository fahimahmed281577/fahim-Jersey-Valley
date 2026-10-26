---
name: astro-7
description: >
  Comprehensive architecture, compilation rules, island hydration patterns,
  server-side routing, and error prevention guidelines for Astro 7.
---

# Astro 7 Engineering Skill Guide

Astro 7 is a modern, content-first and application-ready web framework powered by a high-performance Rust compiler and Vite 8 (Rolldown bundler). It enforces a strict zero-JavaScript-by-default architecture while enabling client hydration via the Islands Architecture.

---

## 1. Core Architecture & Philosophy

1. **Zero JS by Default:**
   - Astro components (`.astro`) render exclusively on the server to static HTML/CSS.
   - No client-side JavaScript runtime is shipped unless explicitly opted into via client directives.
2. **Islands Architecture:**
   - Interactive UI components (e.g. React, Preact, Vue, Svelte) are isolated into "islands".
   - Each island hydrates independently without blocking the rest of the page.
3. **Unified Server Pipeline:**
   - Supports static site generation (SSG), server-side rendering (SSR), and hybrid output via `@astrojs/node` or `@astrojs/vercel`.
   - Native API routes (`src/pages/api/*.ts`) exporting standard web standard `Response` objects.

---

## 2. Astro 7 Compiler & Strict Parser Rules

Astro 7 introduces a strict, high-speed Rust compiler. It does **not** silently forgive HTML malformations.

### Critical Parser Rules:
- **Strict Self-Closing Tags:** Void elements (`<img />`, `<input />`, `<br />`, `<hr />`) must either be self-closed or strictly formatted.
- **Valid Nesting:** Do not place block elements inside `<p>` tags (e.g., `<p><div>...</div></p>` will fail or lead to hydration failure).
- **JSX Expression Escaping:**
  - Curly braces `{}` denote JavaScript expressions in `.astro` frontmatter templates.
  - To display literal `{` or `}`, escape them or use HTML entities (`&#123;`, `&#125;`).
- **No Client React Hooks in `.astro` Frontmatter:**
  - The code between `---` fences executes **strictly on the server** at build or request time.
  - Never import or call `useState`, `useEffect`, `useContext`, or browser globals (`window`, `localStorage`, `document`) inside `.astro` frontmatter without runtime environment checks (`typeof window !== 'undefined'`).

---

## 3. Hydration Directives & Island Discipline

When embedding interactive React/UI components inside Astro pages, always choose the most conservative hydration directive:

| Directive | Execution Timing | Best Use Case |
| :--- | :--- | :--- |
| *(None)* | Server-only HTML (No JS) | Pure presentation, static cards, footers, badges. |
| `client:load` | Hydrates immediately on page load | Mission-critical controls (Mobile menu drawer, auth modal, primary buy button). |
| `client:idle` | Hydrates once the main thread is idle | Secondary interactive widgets, currency toggles, search modals. |
| `client:visible` | Hydrates when scrolled into view (IntersectionObserver) | Below-the-fold carousels, customer reviews, product recommendation grids. |
| `client:media="(query)"` | Hydrates only when media query matches | Desktop-only hover menus, mobile-only sticky action bars. |
| `client:only="react"` | Skips SSR entirely, mounts on client only | Heavy client-only widgets, canvas animations, browser storage readers. |

### Hydration Pitfalls:
- **Missing Directive:** Placing `<AddToCartButton />` in an Astro page without a directive renders it as inert HTML; clicks will do nothing.
- **Non-Serializable Props:** Props passed across the Astro-to-React boundary must be JSON-serializable. Do not pass functions, classes, symbols, or Firestore DocumentSnapshot instances as props. Pass plain data and callbacks defined inside the island.

---

## 4. State Management Across Islands

Because Astro islands do not share a single React root:
- React Context cannot be shared across two distinct Astro islands on the same page.
- **Recommended Solution:** Use **Nano Stores** (`nanostores`, `@nanostores/react`) or a client-side **Zustand** store with persistence.
- Example pattern for shared shopping cart:
  ```typescript
  // src/stores/cart.ts
  import { atom } from 'nanostores';
  export const $cartCount = atom<number>(0);
  export function addToCart(item: any) {
    $cartCount.set($cartCount.get() + 1);
  }
  ```
  Both `HeaderNav.tsx` (`client:load`) and `ProductCard.tsx` (`client:visible`) can subscribe to `$cartCount` with `useStore($cartCount)` without needing a shared React context provider.

---

## 5. API Endpoints & Server Middleware

Astro 7 endpoints use web-standard `Request` and `Response`:

```typescript
// src/pages/api/orders.ts
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    // Validate with Zod and process
    return new Response(JSON.stringify({ success: true, orderId: 'JV-1001' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

Middleware (`src/middleware.ts`) protects routes, authenticates sessions, and injects context into `Astro.locals`:
```typescript
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies } = context;
  if (url.pathname.startsWith('/admin')) {
    const session = cookies.get('jv_admin_session');
    if (!session?.value) {
      return context.redirect('/admin/login');
    }
  }
  return next();
});
```

---

## 6. Migration & Interoperability Checklist

When converting or integrating an existing React + Vite + Express application:
1. **Preserve Component Logic:** Keep React components intact (`.tsx`). Wrap them as islands in Astro layouts (`.astro`).
2. **Routing:** Map client-side routes (e.g. `/`, `/products`, `/admin`) to Astro pages (`src/pages/index.astro`, `src/pages/products/[id].astro`).
3. **SSR Adapter:** Configure `@astrojs/vercel` or `@astrojs/node` to support dynamic server sessions and API endpoints.
4. **Environment Variables:**
   - Astro uses `import.meta.env.PUBLIC_*` for browser-exposed variables (similar to `VITE_*`).
   - Server-only variables (e.g. Firebase Admin keys, DB secrets) use standard `import.meta.env.*` or `process.env.*` without the `PUBLIC_` prefix.
